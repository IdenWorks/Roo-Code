import { exec } from "child_process"
import { promisify } from "util"

const execAsync = promisify(exec)

export interface CommandResult {
	stdout: string
	stderr: string
	exitCode: number
}

export class CommandExecutor {
	/**
	 * Execute a command and return the result
	 */
	static async execute(command: string, cwd?: string): Promise<CommandResult> {
		try {
			const { stdout, stderr } = await execAsync(command, {
				cwd: cwd || process.cwd(),
				encoding: "utf8",
			})

			return {
				stdout: stdout || "",
				stderr: stderr || "",
				exitCode: 0,
			}
		} catch (error: any) {
			return {
				stdout: error.stdout || "",
				stderr: error.stderr || error.message || "",
				exitCode: error.code || 1,
			}
		}
	}

	/**
	 * Execute a command and return only stdout, throwing on error
	 */
	static async executeForOutput(command: string, cwd?: string): Promise<string> {
		const result = await this.execute(command, cwd)

		if (result.exitCode !== 0) {
			throw new Error(`Command failed with exit code ${result.exitCode}: ${result.stderr}`)
		}

		return result.stdout
	}

	/**
	 * Check if a command exists and is executable
	 */
	static async commandExists(command: string): Promise<boolean> {
		try {
			const checkCommand = process.platform === "win32" ? `where ${command}` : `which ${command}`

			const result = await this.execute(checkCommand)
			return result.exitCode === 0
		} catch (error) {
			return false
		}
	}
}
