import Anthropic from "@anthropic-ai/sdk"

import { Task } from "../task/Task"
import {
	ToolResponse,
	ToolUse,
	AskApproval,
	HandleError,
	PushToolResult,
	RemoveClosingTag,
	ToolDescription,
	AskFinishSubTaskApproval,
} from "../../shared/tools"
import { formatResponse } from "../prompts/responses"
import { telemetryService } from "../../services/telemetry/TelemetryService"
import { type ExecuteCommandOptions, executeCommand } from "./executeCommandTool"
import { GitService, GitServiceError } from "../../services/git"

/**
 * Handle git auto-commit and PR creation after task completion
 */
async function handleGitAutoCommit(cline: Task, result: string): Promise<string> {
	try {
		// Get settings from provider
		const provider = cline.providerRef.deref()
		if (!provider) {
			return result
		}

		const state = await provider.getState()
		if (!state) {
			return result
		}

		// Type assertion to access git settings (they exist in schema but may not be in types yet)
		const stateWithGit = state as any

		// Check if git auto-commit is enabled
		const gitAutoCommitEnabled = stateWithGit.gitAutoCommitEnabled
		if (!gitAutoCommitEnabled) {
			return result
		}

		const gitService = new GitService()

		// Check prerequisites first
		const prereqCheck = await gitService.checkPrerequisites()
		if (!prereqCheck.success) {
			return result
		}

		// Check git status
		const gitStatus = await gitService.getGitStatus()
		if (!gitStatus.isGitRepository) {
			return result
		}

		// Check if there are changes to commit
		const changesSummary = await gitService.analyzeChanges()
		if (!changesSummary) {
			return result
		}

		// Prepare commit and PR options
		const commitOptions = {
			taskId: cline.taskId,
			taskDescription: result.substring(0, 100), // Truncate for commit message
			branchPrefix: stateWithGit.gitBranchPrefix,
			commitMessageTemplate: stateWithGit.gitCommitMessageTemplate,
			requireCleanWorkingDirectory: stateWithGit.gitRequireCleanWorkingDirectory,
		}

		const prOptions = {
			taskId: cline.taskId,
			taskDescription: result.substring(0, 100),
			prTitleTemplate: stateWithGit.gitPrTitleTemplate,
			prBodyTemplate: stateWithGit.gitPrBodyTemplate,
		}

		// Execute git workflow
		const gitResult = await gitService.commitAndCreatePR(commitOptions, prOptions)

		if (gitResult.success) {
			// Update result with git information
			let updatedResult = result

			if (gitResult.commitHash) {
				updatedResult += `\n\n**Git Commit:** ${gitResult.commitHash.substring(0, 8)}`
			}

			if (gitResult.branchName) {
				updatedResult += `\n**Branch:** ${gitResult.branchName}`
			}

			if (gitResult.prUrl) {
				updatedResult += `\n**Pull Request:** ${gitResult.prUrl}`
			}

			return updatedResult
		} else {
			// Log error but don't fail the task
			if (gitResult.commitHash) {
				return result + `\n\n**Git Commit:** ${gitResult.commitHash.substring(0, 8)} (PR creation failed)`
			}
			return result
		}
	} catch (error) {
		// Log error but don't fail the task
		// Consider if specific error handling for GitServiceError is still needed or if a generic approach is fine.
		// For now, just returning result to maintain original behavior of not failing the task.
		return result
	}
}

export async function attemptCompletionTool(
	cline: Task,
	block: ToolUse,
	askApproval: AskApproval,
	handleError: HandleError,
	pushToolResult: PushToolResult,
	removeClosingTag: RemoveClosingTag,
	toolDescription: ToolDescription,
	askFinishSubTaskApproval: AskFinishSubTaskApproval,
) {
	const result: string | undefined = block.params.result
	const command: string | undefined = block.params.command

	try {
		const lastMessage = cline.clineMessages.at(-1)

		if (block.partial) {
			if (command) {
				// the attempt_completion text is done, now we're getting command
				// remove the previous partial attempt_completion ask, replace with say, post state to webview, then stream command

				// const secondLastMessage = cline.clineMessages.at(-2)
				if (lastMessage && lastMessage.ask === "command") {
					// update command
					await cline.ask("command", removeClosingTag("command", command), block.partial).catch(() => {})
				} else {
					// last message is completion_result
					// we have command string, which means we have the result as well, so finish it (doesnt have to exist yet)
					await cline.say("completion_result", removeClosingTag("result", result), undefined, false)

					telemetryService.captureTaskCompleted(cline.taskId)
					cline.emit("taskCompleted", cline.taskId, cline.getTokenUsage(), cline.toolUsage)

					await cline.ask("command", removeClosingTag("command", command), block.partial).catch(() => {})
				}
			} else {
				// no command, still outputting partial result
				await cline.say("completion_result", removeClosingTag("result", result), undefined, block.partial)
			}
			return
		} else {
			if (!result) {
				cline.consecutiveMistakeCount++
				cline.recordToolError("attempt_completion")
				pushToolResult(await cline.sayAndCreateMissingParamError("attempt_completion", "result"))
				return
			}

			cline.consecutiveMistakeCount = 0

			let commandResult: ToolResponse | undefined

			if (command) {
				if (lastMessage && lastMessage.ask !== "command") {
					// Haven't sent a command message yet so first send completion_result then command.
					// Handle git auto-commit before saying completion result
					const finalResult = await handleGitAutoCommit(cline, result)
					await cline.say("completion_result", finalResult, undefined, false)
					telemetryService.captureTaskCompleted(cline.taskId)
					cline.emit("taskCompleted", cline.taskId, cline.getTokenUsage(), cline.toolUsage)
				}

				// Complete command message.
				const didApprove = await askApproval("command", command)

				if (!didApprove) {
					return
				}

				const executionId = cline.lastMessageTs?.toString() ?? Date.now().toString()
				const options: ExecuteCommandOptions = { executionId, command }
				const [userRejected, execCommandResult] = await executeCommand(cline, options)

				if (userRejected) {
					cline.didRejectTool = true
					pushToolResult(execCommandResult)
					return
				}

				// User didn't reject, but the command may have output.
				commandResult = execCommandResult
			} else {
				// Handle git auto-commit before saying completion result
				const finalResult = await handleGitAutoCommit(cline, result)
				await cline.say("completion_result", finalResult, undefined, false)
				telemetryService.captureTaskCompleted(cline.taskId)
				cline.emit("taskCompleted", cline.taskId, cline.getTokenUsage(), cline.toolUsage)
			}

			if (cline.parentTask) {
				const didApprove = await askFinishSubTaskApproval()

				if (!didApprove) {
					return
				}

				// tell the provider to remove the current subtask and resume the previous task in the stack
				await cline.providerRef.deref()?.finishSubTask(result)
				return
			}

			// We already sent completion_result says, an
			// empty string asks relinquishes control over
			// button and field.
			const { response, text, images } = await cline.ask("completion_result", "", false)

			// Signals to recursive loop to stop (for now
			// cline never happens since yesButtonClicked
			// will trigger a new task).
			if (response === "yesButtonClicked") {
				pushToolResult("")
				return
			}

			await cline.say("user_feedback", text ?? "", images)
			const toolResults: (Anthropic.TextBlockParam | Anthropic.ImageBlockParam)[] = []

			if (commandResult) {
				if (typeof commandResult === "string") {
					toolResults.push({ type: "text", text: commandResult })
				} else if (Array.isArray(commandResult)) {
					toolResults.push(...commandResult)
				}
			}

			toolResults.push({
				type: "text",
				text: `The user has provided feedback on the results. Consider their input to continue the task, and then attempt completion again.\n<feedback>\n${text}\n</feedback>`,
			})

			toolResults.push(...formatResponse.imageBlocks(images))
			cline.userMessageContent.push({ type: "text", text: `${toolDescription()} Result:` })
			cline.userMessageContent.push(...toolResults)

			return
		}
	} catch (error) {
		await handleError("inspecting site", error)
		return
	}
}
