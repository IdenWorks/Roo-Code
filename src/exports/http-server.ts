import express from "express"
import type { Express, Request, Response, Router } from "express"
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

export class HttpApiServer {
	private app: Express
	private router: Router
	private server: any
	private port: number
	private api: API

	constructor(api: API, port = 3000) {
		this.api = api
		this.port = port
		this.app = express()
		this.router = express.Router()

		// Setup middleware
		this.app.use(cors())
		this.setupRoutes()
		this.app.use(this.router)
	}

	private setupRoutes() {
		// Health check endpoint
		this.router.get("/health", (req: Request, res: Response) => {
			res.json({ status: "ok" })
		})

		// Tasks
		this.router.post("/tasks", async (req: Request, res: Response) => {
			try {
				// Get form data fields
				// Configuration is always sent as a JSON string from Python services
				const configuration = req.body.configuration ? JSON.parse(req.body.configuration) : undefined
				const text = req.body.text
				const newTab = req.body.new_tab
				const images: string[] = req.body.images || []

				// Start the task with processed data
				const taskId = await this.api.startNewTask({
					configuration: configuration as RooCodeSettings,
					text,
					images,
					newTab,
				})

				res.json({ id: taskId })
			} catch (error: any) {
				res.status(500).json({ error: error.message })
			}
		})

		this.router.post("/tasks/:taskId/resume", async (req: Request<{ taskId: string }>, res: Response) => {
			try {
				const { taskId } = req.params
				await this.api.resumeTask(taskId)
				res.json({ success: true })
			} catch (error: any) {
				res.status(500).json({ error: error.message })
			}
		})

		this.router.get("/tasks/:taskId/exists", async (req: Request<{ taskId: string }>, res: Response) => {
			try {
				const { taskId } = req.params
				const exists = await this.api.isTaskInHistory(taskId)
				res.json({ exists })
			} catch (error: any) {
				res.status(500).json({ error: error.message })
			}
		})

		this.router.get("/tasks/current/stack", (req: Request, res: Response) => {
			try {
				const stack = this.api.getCurrentTaskStack()
				res.json({ stack })
			} catch (error: any) {
				res.status(500).json({ error: error.message })
			}
		})

		this.router.get("/tasks/current/status", (req: Request, res: Response) => {
			try {
				const status = this.api.getStatus()
				res.json({ status })
			} catch (error: any) {
				res.status(500).json({ error: error.message })
			}
		})

		this.router.post("/tasks/current/clear", async (req: Request<object, any, ClearTaskRequest>, res: Response) => {
			try {
				const { lastMessage } = req.body
				await this.api.clearCurrentTask(lastMessage)
				res.json({ success: true })
			} catch (error: any) {
				res.status(500).json({ error: error.message })
			}
		})

		this.router.post("/tasks/current/cancel", async (req: Request, res: Response) => {
			try {
				await this.api.cancelCurrentTask()
				res.json({ success: true })
			} catch (error: any) {
				res.status(500).json({ error: error.message })
			}
		})

		this.router.post("/tasks/:taskId/cancel", async (req: Request<{ taskId: string }>, res: Response) => {
			try {
				const { taskId } = req.params
				await this.api.cancelTask(taskId)
				res.json({ success: true })
			} catch (error: any) {
				res.status(500).json({ error: error.message })
			}
		})

		// Messages
		this.router.post("/messages/send", async (req: Request, res: Response) => {
			try {
				const message = req.body.message

				await this.api.sendMessage(message)
				res.json({ success: true })
			} catch (error: any) {
				res.status(500).json({ error: error.message })
			}
		})

		// Buttons
		this.router.post("/buttons/primary", async (req: Request, res: Response) => {
			try {
				await this.api.pressPrimaryButton()
				res.json({ success: true })
			} catch (error: any) {
				res.status(500).json({ error: error.message })
			}
		})

		this.router.post("/buttons/secondary", async (req: Request, res: Response) => {
			try {
				await this.api.pressSecondaryButton()
				res.json({ success: true })
			} catch (error: any) {
				res.status(500).json({ error: error.message })
			}
		})

		// Configuration
		this.router.get("/configuration", (req: Request, res: Response) => {
			try {
				const config = this.api.getConfiguration()
				res.json(config)
			} catch (error: any) {
				res.status(500).json({ error: error.message })
			}
		})

		this.router.post("/configuration", async (req: Request<object, any, RooCodeSettings>, res: Response) => {
			try {
				const config: RooCodeSettings = req.body
				await this.api.setConfiguration(config)
				res.json({ success: true })
			} catch (error: any) {
				res.status(500).json({ error: error.message })
			}
		})

		// Profiles
		this.router.post("/profiles", async (req: Request<object, any, CreateProfileRequest>, res: Response) => {
			try {
				const { name } = req.body
				const id = await this.api.createProfile(name)
				res.json({ id })
			} catch (error: any) {
				res.status(500).json({ error: error.message })
			}
		})

		this.router.get("/profiles", (req: Request, res: Response) => {
			try {
				const profiles = this.api.getProfiles()
				res.json({ profiles })
			} catch (error: any) {
				res.status(500).json({ error: error.message })
			}
		})

		this.router.post(
			"/profiles/active",
			async (req: Request<object, any, SetActiveProfileRequest>, res: Response) => {
				try {
					const { name } = req.body
					await this.api.setActiveProfile(name)
					res.json({ success: true })
				} catch (error: any) {
					res.status(500).json({ error: error.message })
				}
			},
		)

		this.router.get("/profiles/active", (req: Request, res: Response) => {
			try {
				const activeProfile = this.api.getActiveProfile()
				res.json({ activeProfile })
			} catch (error: any) {
				res.status(500).json({ error: error.message })
			}
		})

		this.router.delete("/profiles/:name", async (req: Request<{ name: string }>, res: Response) => {
			try {
				const { name } = req.params
				await this.api.deleteProfile(name)
				res.json({ success: true })
			} catch (error: any) {
				res.status(500).json({ error: error.message })
			}
		})

		// Status
		this.router.get("/ready", (req: Request, res: Response) => {
			try {
				const isReady = this.api.isReady()
				res.json({ ready: isReady })
			} catch (error: any) {
				res.status(500).json({ error: error.message })
			}
		})
	}

	public start(): Promise<void> {
		return new Promise((resolve) => {
			this.server = this.app.listen(this.port, () => {
				console.log(`RooCode HTTP API server running on port ${this.port}`)
				resolve()
			})
		})
	}

	public stop(): Promise<void> {
		return new Promise((resolve, reject) => {
			if (!this.server) {
				return resolve()
			}

			this.server.close((err: Error) => {
				if (err) {
					return reject(err)
				}
				resolve()
			})
		})
	}
}
