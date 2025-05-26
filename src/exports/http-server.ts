import express from "express"
import type { Express, Request, Response, NextFunction, ErrorRequestHandler } from "express"
import cors from "cors"
import { API } from "../exports/api"
import { RooCodeSettings } from "../schemas"

// Request body interfaces
interface ClearTaskRequest {
	lastMessage?: string
}

interface CreateProfileRequest {
	name: string
}

interface SetActiveProfileRequest {
	name: string
}

interface ServerConfig {
	port?: number
	corsOrigins?: string[]
	enableRequestLogging?: boolean
}

// Custom error class for API errors
class ApiError extends Error {
	constructor(
		message: string,
		public statusCode: number = 500,
		public code?: string,
	) {
		super(message)
		this.name = "ApiError"
	}
}

export class HttpApiServer {
	private app: Express
	private server: any
	private port: number
	private api: API
	private config: ServerConfig

	constructor(api: API, config: ServerConfig = {}) {
		this.api = api
		this.config = {
			port: 6001,
			corsOrigins: ["*"],
			enableRequestLogging: false,
			...config,
		}
		this.port = this.config.port!
		this.app = express()

		this.setupMiddleware()
		this.setupRoutes()
		this.setupErrorHandling()
	}

	private setupMiddleware(): void {
		// CORS configuration
		this.app.use(
			cors({
				origin: this.config.corsOrigins,
				credentials: true,
				methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
				allowedHeaders: ["Content-Type", "Authorization"],
			}),
		)

		// Body parsing with size limits
		this.app.use(express.json({ limit: "10mb" }))
		this.app.use(express.urlencoded({ extended: true, limit: "10mb" }))

		// Request logging middleware (optional)
		if (this.config.enableRequestLogging) {
			this.app.use(this.requestLogger.bind(this))
		}
	}

	private requestLogger(req: Request, res: Response, next: NextFunction): void {
		const start = Date.now()
		const { method, url, ip } = req

		res.on("finish", () => {
			const duration = Date.now() - start
			const { statusCode } = res
			console.log(`${method} ${url} ${statusCode} ${duration}ms - ${ip}`)
		})

		next()
	}

	private setupRoutes(): void {
		// Health check endpoint
		this.app.get("/health", this.healthCheck.bind(this))

		// Task routes
		this.setupTaskRoutes()

		// Message routes
		this.setupMessageRoutes()

		// Button routes
		this.setupButtonRoutes()

		// Configuration routes
		this.setupConfigurationRoutes()

		// Profile routes
		this.setupProfileRoutes()

		// Status routes
		this.setupStatusRoutes()
	}

	private setupTaskRoutes(): void {
		const router = express.Router()

		// Create new task
		router.post(
			"/",
			this.asyncHandler(async (req: Request, res: Response) => {
				// Get form data fields
				// Configuration is always sent as a JSON string from Python services
				const configuration = req.body.configuration ? JSON.parse(req.body.configuration) : undefined
				const text = req.body.text
				const newTab = req.body.new_tab
				const images: string[] = req.body.images || []

				// Validate required fields
				if (!text) {
					throw new ApiError("Text is required", 400)
				}

				// Start the task with processed data
				const taskId = await this.api.startNewTask({
					configuration: configuration as RooCodeSettings,
					text,
					images,
					newTab,
				})

				res.status(201).json({ id: taskId })
			}),
		)

		// Resume task
		router.post(
			"/:taskId/resume",
			this.asyncHandler(async (req: Request<{ taskId: string }>, res: Response) => {
				const { taskId } = req.params

				if (!taskId) {
					throw new ApiError("Task ID is required", 400)
				}

				await this.api.resumeTask(taskId)
				res.json({ success: true })
			}),
		)

		// Check if task exists
		router.get(
			"/:taskId/exists",
			this.asyncHandler(async (req: Request<{ taskId: string }>, res: Response) => {
				const { taskId } = req.params

				if (!taskId) {
					throw new ApiError("Task ID is required", 400)
				}

				const exists = await this.api.isTaskInHistory(taskId)
				res.json({ exists })
			}),
		)

		// Get current task stack
		router.get(
			"/current/stack",
			this.asyncHandler(async (req: Request, res: Response) => {
				const stack = this.api.getCurrentTaskStack()
				res.json({ stack })
			}),
		)

		// Get current task status
		router.get(
			"/current/status",
			this.asyncHandler(async (req: Request, res: Response) => {
				const status = this.api.getStatus()
				res.json({ status })
			}),
		)

		// Clear current task
		router.post(
			"/current/clear",
			this.asyncHandler(async (req: Request<object, any, ClearTaskRequest>, res: Response) => {
				const { lastMessage } = req.body
				await this.api.clearCurrentTask(lastMessage)
				res.json({ success: true })
			}),
		)

		// Cancel current task
		router.post(
			"/current/cancel",
			this.asyncHandler(async (req: Request, res: Response) => {
				await this.api.cancelCurrentTask()
				res.json({ success: true })
			}),
		)

		// Cancel specific task
		router.post(
			"/:taskId/cancel",
			this.asyncHandler(async (req: Request<{ taskId: string }>, res: Response) => {
				const { taskId } = req.params

				if (!taskId) {
					throw new ApiError("Task ID is required", 400)
				}

				await this.api.cancelTask(taskId)
				res.json({ success: true })
			}),
		)

		this.app.use("/tasks", router)
	}

	private setupMessageRoutes(): void {
		const router = express.Router()

		router.post(
			"/send",
			this.asyncHandler(async (req: Request, res: Response) => {
				const { message } = req.body

				if (!message) {
					throw new ApiError("Message is required", 400)
				}

				await this.api.sendMessage(message)
				res.json({ success: true })
			}),
		)

		this.app.use("/messages", router)
	}

	private setupButtonRoutes(): void {
		const router = express.Router()

		router.post(
			"/primary",
			this.asyncHandler(async (req: Request, res: Response) => {
				await this.api.pressPrimaryButton()
				res.json({ success: true })
			}),
		)

		router.post(
			"/secondary",
			this.asyncHandler(async (req: Request, res: Response) => {
				await this.api.pressSecondaryButton()
				res.json({ success: true })
			}),
		)

		this.app.use("/buttons", router)
	}

	private setupConfigurationRoutes(): void {
		const router = express.Router()

		router.get(
			"/",
			this.asyncHandler(async (req: Request, res: Response) => {
				const config = this.api.getConfiguration()
				res.json(config)
			}),
		)

		router.post(
			"/",
			this.asyncHandler(async (req: Request<object, any, RooCodeSettings>, res: Response) => {
				const config: RooCodeSettings = req.body

				if (!config) {
					throw new ApiError("Configuration is required", 400)
				}

				await this.api.setConfiguration(config)
				res.json({ success: true })
			}),
		)

		this.app.use("/configuration", router)
	}

	private setupProfileRoutes(): void {
		const router = express.Router()

		// Create profile
		router.post(
			"/",
			this.asyncHandler(async (req: Request<object, any, CreateProfileRequest>, res: Response) => {
				const { name } = req.body

				if (!name || typeof name !== "string" || name.trim().length === 0) {
					throw new ApiError("Profile name is required and must be a non-empty string", 400)
				}

				const id = await this.api.createProfile(name.trim())
				res.status(201).json({ id })
			}),
		)

		// Get all profiles
		router.get(
			"/",
			this.asyncHandler(async (req: Request, res: Response) => {
				const profiles = this.api.getProfiles()
				res.json({ profiles })
			}),
		)

		// Set active profile
		router.post(
			"/active",
			this.asyncHandler(async (req: Request<object, any, SetActiveProfileRequest>, res: Response) => {
				const { name } = req.body

				if (!name || typeof name !== "string" || name.trim().length === 0) {
					throw new ApiError("Profile name is required and must be a non-empty string", 400)
				}

				await this.api.setActiveProfile(name.trim())
				res.json({ success: true })
			}),
		)

		// Get active profile
		router.get(
			"/active",
			this.asyncHandler(async (req: Request, res: Response) => {
				const activeProfile = this.api.getActiveProfile()
				res.json({ activeProfile })
			}),
		)

		// Delete profile
		router.delete(
			"/:name",
			this.asyncHandler(async (req: Request<{ name: string }>, res: Response) => {
				const { name } = req.params

				if (!name || name.trim().length === 0) {
					throw new ApiError("Profile name is required", 400)
				}

				await this.api.deleteProfile(name.trim())
				res.json({ success: true })
			}),
		)

		this.app.use("/profiles", router)
	}

	private setupStatusRoutes(): void {
		this.app.get(
			"/ready",
			this.asyncHandler(async (req: Request, res: Response) => {
				const isReady = this.api.isReady()
				res.json({ ready: isReady })
			}),
		)
	}

	private setupErrorHandling(): void {
		// 404 handler
		this.app.use((req: Request, res: Response) => {
			res.status(404).json({
				error: "Not Found",
				message: `Route ${req.method} ${req.path} not found`,
				timestamp: new Date().toISOString(),
			})
		})

		// Global error handler
		this.app.use(this.errorHandler.bind(this))
	}

	private errorHandler: ErrorRequestHandler = (error: any, req: Request, res: Response, next: NextFunction) => {
		console.error("API Error:", error)

		if (error instanceof ApiError) {
			res.status(error.statusCode).json({
				error: error.name,
				message: error.message,
				code: error.code,
				timestamp: new Date().toISOString(),
			})
			return
		}

		// Handle JSON parsing errors
		if (error instanceof SyntaxError && "body" in error) {
			res.status(400).json({
				error: "Bad Request",
				message: "Invalid JSON in request body",
				timestamp: new Date().toISOString(),
			})
			return
		}

		// Generic error handler
		res.status(500).json({
			error: "Internal Server Error",
			message: process.env.NODE_ENV === "development" ? error.message : "Something went wrong",
			timestamp: new Date().toISOString(),
		})
	}

	private healthCheck(req: Request, res: Response): void {
		const healthStatus = {
			status: "ok",
			timestamp: new Date().toISOString(),
			uptime: process.uptime(),
			version: process.env.npm_package_version || "unknown",
			environment: process.env.NODE_ENV || "development",
			ready: this.api.isReady(),
		}

		res.status(200).json(healthStatus)
	}

	// Async error handler wrapper
	private asyncHandler(fn: (req: any, res: Response, next?: NextFunction) => Promise<any>) {
		return (req: any, res: Response, next: NextFunction) => {
			Promise.resolve(fn(req, res, next)).catch(next)
		}
	}

	public async start(): Promise<void> {
		return new Promise((resolve, reject) => {
			try {
				this.server = this.app.listen(this.port, () => {
					console.log(`🚀 RooCode HTTP API server running on port ${this.port}`)
					console.log(`📊 Health check available at http://localhost:${this.port}/health`)
					resolve()
				})

				this.server.on("error", (error: Error) => {
					console.error("Server error:", error)
					reject(error)
				})
			} catch (error) {
				reject(error)
			}
		})
	}

	public async stop(): Promise<void> {
		return new Promise((resolve, reject) => {
			if (!this.server) {
				return resolve()
			}

			console.log("🛑 Shutting down HTTP API server...")

			this.server.close((err: Error) => {
				if (err) {
					console.error("Error shutting down server:", err)
					return reject(err)
				}
				console.log("✅ HTTP API server shut down successfully")
				resolve()
			})
		})
	}

	public getApp(): Express {
		return this.app
	}

	public getPort(): number {
		return this.port
	}

	public isRunning(): boolean {
		return !!this.server && this.server.listening
	}
}
