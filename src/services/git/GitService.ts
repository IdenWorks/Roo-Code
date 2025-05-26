import { CommandExecutor } from "./CommandExecutor"
import { TemplateEngine } from "./TemplateEngine"

export interface GitCommitOptions {
	taskId: string
	taskDescription: string
	branchPrefix?: string
	commitMessageTemplate?: string
	requireCleanWorkingDirectory?: boolean
}

export interface GitPROptions {
	taskId: string
	taskDescription: string
	branchName: string
	commitHash: string
	prTitleTemplate?: string
	prBodyTemplate?: string
	changesSummary: GitChangesSummary
}

export interface GitChangesSummary {
	addedFiles: string[]
	modifiedFiles: string[]
	deletedFiles: string[]
	renamedFiles: Array<{ from: string; to: string }>
	totalChanges: number
	changeType: string
}

export interface GitStatus {
	isGitRepository: boolean
	hasRemoteOrigin: boolean
	currentBranch: string
	hasUncommittedChanges: boolean
	hasUnpushedCommits: boolean
	workingDirectoryClean: boolean
}

export class GitServiceError extends Error {
	constructor(
		message: string,
		public readonly code: string,
	) {
		super(message)
		this.name = "GitServiceError"
	}
}

export class GitService {
	private templateEngine: TemplateEngine

	constructor() {
		this.templateEngine = new TemplateEngine()
	}

	/**
	 * Check if all prerequisites are met for git operations
	 */
	async checkPrerequisites(): Promise<{ success: boolean; errors: string[] }> {
		const errors: string[] = []

		// Check if git is available
		try {
			await CommandExecutor.executeForOutput("git --version")
		} catch (error) {
			errors.push("Git is not installed or not available in PATH")
		}

		// Check if GitHub CLI is available
		try {
			await CommandExecutor.executeForOutput("gh --version")
		} catch (error) {
			errors.push("GitHub CLI (gh) is not installed or not available in PATH")
		}

		// Check if GitHub CLI is authenticated
		try {
			await CommandExecutor.executeForOutput("gh auth status")
		} catch (error) {
			errors.push("GitHub CLI is not authenticated. Run 'gh auth login' to authenticate")
		}

		return {
			success: errors.length === 0,
			errors,
		}
	}

	/**
	 * Get the current git repository status
	 */
	async getGitStatus(): Promise<GitStatus> {
		try {
			// Check if we're in a git repository
			await CommandExecutor.executeForOutput("git rev-parse --git-dir")
		} catch (error) {
			return {
				isGitRepository: false,
				hasRemoteOrigin: false,
				currentBranch: "",
				hasUncommittedChanges: false,
				hasUnpushedCommits: false,
				workingDirectoryClean: false,
			}
		}

		// Get current branch
		let currentBranch = ""
		try {
			const branchResult = await CommandExecutor.executeForOutput("git branch --show-current")
			currentBranch = branchResult.trim()
		} catch (error) {
			// Might be in detached HEAD state
			currentBranch = "HEAD"
		}

		// Check for remote origin
		let hasRemoteOrigin = false
		try {
			await CommandExecutor.executeForOutput("git remote get-url origin")
			hasRemoteOrigin = true
		} catch (error) {
			hasRemoteOrigin = false
		}

		// Check for uncommitted changes
		let hasUncommittedChanges = false
		let workingDirectoryClean = true
		try {
			const statusResult = await CommandExecutor.executeForOutput("git status --porcelain")
			hasUncommittedChanges = statusResult.trim().length > 0
			workingDirectoryClean = !hasUncommittedChanges
		} catch (error) {
			// Assume dirty if we can't check
			hasUncommittedChanges = true
			workingDirectoryClean = false
		}

		// Check for unpushed commits
		let hasUnpushedCommits = false
		try {
			if (hasRemoteOrigin && currentBranch !== "HEAD") {
				const unpushedResult = await CommandExecutor.executeForOutput(
					`git log origin/${currentBranch}..HEAD --oneline`,
				)
				hasUnpushedCommits = unpushedResult.trim().length > 0
			}
		} catch (error) {
			// Remote branch might not exist, which is fine
			hasUnpushedCommits = false
		}

		return {
			isGitRepository: true,
			hasRemoteOrigin,
			currentBranch,
			hasUncommittedChanges,
			hasUnpushedCommits,
			workingDirectoryClean,
		}
	}

	/**
	 * Analyze changes in the repository and determine change type
	 */
	async analyzeChanges(): Promise<GitChangesSummary | null> {
		try {
			const statusResult = await CommandExecutor.executeForOutput("git status --porcelain")
			const statusLines = statusResult
				.trim()
				.split("\n")
				.filter((line: string) => line.length > 0)

			if (statusLines.length === 0) {
				return null // No changes
			}

			const addedFiles: string[] = []
			const modifiedFiles: string[] = []
			const deletedFiles: string[] = []
			const renamedFiles: Array<{ from: string; to: string }> = []

			for (const line of statusLines) {
				const status = line.substring(0, 2)
				const filePath = line.substring(3)

				switch (status.trim()) {
					case "A":
					case "??":
						addedFiles.push(filePath)
						break
					case "M":
					case "AM":
					case "MM":
						modifiedFiles.push(filePath)
						break
					case "D":
						deletedFiles.push(filePath)
						break
					case "R": {
						// Renamed files have format "R  old_name -> new_name"
						const parts = filePath.split(" -> ")
						if (parts.length === 2) {
							renamedFiles.push({ from: parts[0], to: parts[1] })
						}
						break
					}
					default:
						// Handle other statuses as modifications
						if (status.includes("M")) {
							modifiedFiles.push(filePath)
						} else if (status.includes("A")) {
							addedFiles.push(filePath)
						} else if (status.includes("D")) {
							deletedFiles.push(filePath)
						}
				}
			}

			const totalChanges = addedFiles.length + modifiedFiles.length + deletedFiles.length + renamedFiles.length
			const changeType = this.determineChangeType(addedFiles, modifiedFiles, deletedFiles)

			return {
				addedFiles,
				modifiedFiles,
				deletedFiles,
				renamedFiles,
				totalChanges,
				changeType,
			}
		} catch (error) {
			throw new GitServiceError(`Failed to analyze changes: ${error}`, "ANALYZE_CHANGES_FAILED")
		}
	}

	/**
	 * Determine semantic commit type based on file changes
	 */
	private determineChangeType(addedFiles: string[], modifiedFiles: string[], deletedFiles: string[]): string {
		const allFiles = [...addedFiles, ...modifiedFiles, ...deletedFiles]

		// Check for documentation changes
		if (
			allFiles.some(
				(file) => file.toLowerCase().includes("readme") || file.endsWith(".md") || file.startsWith("docs/"),
			)
		) {
			return "docs"
		}

		// Check for test changes
		if (
			allFiles.some(
				(file) =>
					file.includes("test") ||
					file.includes("spec") ||
					file.includes("__tests__") ||
					file.endsWith(".test.ts") ||
					file.endsWith(".test.js") ||
					file.endsWith(".spec.ts") ||
					file.endsWith(".spec.js"),
			)
		) {
			return "test"
		}

		// Check for style changes
		if (
			allFiles.some(
				(file) =>
					file.endsWith(".css") ||
					file.endsWith(".scss") ||
					file.endsWith(".less") ||
					file.includes(".prettierrc") ||
					file.includes(".eslintrc"),
			)
		) {
			return "style"
		}

		// Check for configuration/chore changes
		if (
			allFiles.some(
				(file) =>
					file.endsWith(".json") ||
					file.endsWith(".yaml") ||
					file.endsWith(".yml") ||
					file.includes("package.json") ||
					file.includes("tsconfig") ||
					file.includes("webpack") ||
					file.includes("vite.config"),
			)
		) {
			return "chore"
		}

		// Check for fix-related changes
		if (
			allFiles.some(
				(file) =>
					file.toLowerCase().includes("fix") ||
					file.toLowerCase().includes("bug") ||
					file.toLowerCase().includes("patch"),
			)
		) {
			return "fix"
		}

		// If primarily new files, it's a feature
		if (addedFiles.length > modifiedFiles.length) {
			return "feat"
		}

		// If primarily modified files, it's a refactor
		if (modifiedFiles.length > addedFiles.length && deletedFiles.length === 0) {
			return "refactor"
		}

		// Default to feature for mixed changes
		return "feat"
	}

	/**
	 * Create a git commit with the changes
	 */
	async createCommit(
		options: GitCommitOptions,
	): Promise<{ success: boolean; commitHash?: string; branchName?: string }> {
		try {
			// Check prerequisites
			const prereqCheck = await this.checkPrerequisites()
			if (!prereqCheck.success) {
				throw new GitServiceError(
					`Prerequisites not met: ${prereqCheck.errors.join(", ")}`,
					"PREREQUISITES_NOT_MET",
				)
			}

			// Get git status
			const gitStatus = await this.getGitStatus()
			if (!gitStatus.isGitRepository) {
				throw new GitServiceError("Not in a git repository", "NOT_GIT_REPOSITORY")
			}

			if (options.requireCleanWorkingDirectory && !gitStatus.workingDirectoryClean) {
				throw new GitServiceError("Working directory is not clean", "WORKING_DIRECTORY_NOT_CLEAN")
			}

			// Analyze changes
			const changesSummary = await this.analyzeChanges()
			if (!changesSummary) {
				return { success: false } // No changes to commit
			}

			// Generate branch name
			const branchPrefix = options.branchPrefix || "otto-task"
			const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
			const branchName = `${branchPrefix}-${options.taskId}-${timestamp}`

			// Create and switch to new branch
			await CommandExecutor.executeForOutput(`git checkout -b ${branchName}`)

			// Stage all changes
			await CommandExecutor.executeForOutput("git add .")

			// Generate commit message
			const commitMessage = this.generateCommitMessage(options, changesSummary)

			// Create commit
			await CommandExecutor.executeForOutput(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`)

			// Get commit hash
			const commitHashResult = await CommandExecutor.executeForOutput("git rev-parse HEAD")
			const commitHash = commitHashResult.trim()

			// Push branch to remote
			if (gitStatus.hasRemoteOrigin) {
				await CommandExecutor.executeForOutput(`git push -u origin ${branchName}`)
			}

			return {
				success: true,
				commitHash,
				branchName,
			}
		} catch (error) {
			if (error instanceof GitServiceError) {
				throw error
			}
			throw new GitServiceError(`Failed to create commit: ${error}`, "COMMIT_FAILED")
		}
	}

	/**
	 * Create a GitHub pull request
	 */
	async createPullRequest(options: GitPROptions): Promise<{ success: boolean; prUrl?: string }> {
		try {
			// Check if GitHub CLI is available and authenticated
			const prereqCheck = await this.checkPrerequisites()
			if (!prereqCheck.success) {
				throw new GitServiceError(
					`Prerequisites not met: ${prereqCheck.errors.join(", ")}`,
					"PREREQUISITES_NOT_MET",
				)
			}

			// Generate PR title and body
			const prTitle = this.generatePRTitle(options)
			const prBody = this.generatePRBody(options)

			// Create PR using GitHub CLI
			const prCommand = `gh pr create --title "${prTitle.replace(/"/g, '\\"')}" --body "${prBody.replace(/"/g, '\\"')}" --head ${options.branchName}`
			const prResult = await CommandExecutor.executeForOutput(prCommand)

			// Extract PR URL from the result
			const prUrl = prResult.trim()

			return {
				success: true,
				prUrl,
			}
		} catch (error) {
			if (error instanceof GitServiceError) {
				throw error
			}
			throw new GitServiceError(`Failed to create pull request: ${error}`, "PR_CREATION_FAILED")
		}
	}

	/**
	 * Generate commit message using template
	 */
	private generateCommitMessage(options: GitCommitOptions, changesSummary: GitChangesSummary): string {
		const template = options.commitMessageTemplate || this.getDefaultCommitMessageTemplate()

		const variables = {
			taskId: options.taskId,
			taskDescription: options.taskDescription,
			changeType: changesSummary.changeType,
			addedFiles: changesSummary.addedFiles,
			modifiedFiles: changesSummary.modifiedFiles,
			deletedFiles: changesSummary.deletedFiles,
			renamedFiles: changesSummary.renamedFiles,
			totalChanges: changesSummary.totalChanges,
			timestamp: new Date().toISOString(),
		}

		return this.templateEngine.render(template, variables)
	}

	/**
	 * Generate PR title using template
	 */
	private generatePRTitle(options: GitPROptions): string {
		const template = options.prTitleTemplate || this.getDefaultPRTitleTemplate()

		const variables = {
			taskId: options.taskId,
			taskDescription: options.taskDescription,
			changeType: options.changesSummary.changeType,
			branchName: options.branchName,
			timestamp: new Date().toISOString(),
		}

		return this.templateEngine.render(template, variables)
	}

	/**
	 * Generate PR body using template
	 */
	private generatePRBody(options: GitPROptions): string {
		const template = options.prBodyTemplate || this.getDefaultPRBodyTemplate()

		const variables = {
			taskId: options.taskId,
			taskDescription: options.taskDescription,
			changeType: options.changesSummary.changeType,
			branchName: options.branchName,
			commitHash: options.commitHash,
			addedFiles: options.changesSummary.addedFiles,
			modifiedFiles: options.changesSummary.modifiedFiles,
			deletedFiles: options.changesSummary.deletedFiles,
			renamedFiles: options.changesSummary.renamedFiles,
			totalChanges: options.changesSummary.totalChanges,
			timestamp: new Date().toISOString(),
		}

		return this.templateEngine.render(template, variables)
	}

	/**
	 * Get default commit message template
	 */
	private getDefaultCommitMessageTemplate(): string {
		return `{{changeType}}: {{taskDescription}}

Task ID: {{taskId}}
Changes: {{totalChanges}} files ({{addedFiles.length}} added, {{modifiedFiles.length}} modified, {{deletedFiles.length}} deleted)

{{#if addedFiles.length}}Added:
{{#each addedFiles}}- {{this}}
{{/each}}
{{/if}}{{#if modifiedFiles.length}}Modified:
{{#each modifiedFiles}}- {{this}}
{{/each}}
{{/if}}{{#if deletedFiles.length}}Deleted:
{{#each deletedFiles}}- {{this}}
{{/each}}
{{/if}}`
	}

	/**
	 * Get default PR title template
	 */
	private getDefaultPRTitleTemplate(): string {
		return `{{changeType}}: {{taskDescription}}`
	}

	/**
	 * Get default PR body template
	 */
	private getDefaultPRBodyTemplate(): string {
		return `## Task Completion

**Task ID:** {{taskId}}
**Description:** {{taskDescription}}
**Change Type:** {{changeType}}
**Branch:** {{branchName}}
**Created:** {{timestamp}}

## Summary

This PR contains changes made by Roo-Code to complete the requested task.

## Changes Made

**Total Files Changed:** {{totalChanges}}

{{#if addedFiles.length}}### Added Files ({{addedFiles.length}})
{{#each addedFiles}}- \`{{this}}\`
{{/each}}

{{/if}}{{#if modifiedFiles.length}}### Modified Files ({{modifiedFiles.length}})
{{#each modifiedFiles}}- \`{{this}}\`
{{/each}}

{{/if}}{{#if deletedFiles.length}}### Deleted Files ({{deletedFiles.length}})
{{#each deletedFiles}}- \`{{this}}\`
{{/each}}

{{/if}}---
*This PR was automatically created by Roo-Code*`
	}

	/**
	 * Complete git workflow: commit changes and create PR
	 */
	async commitAndCreatePR(
		commitOptions: GitCommitOptions,
		prOptions: Omit<GitPROptions, "branchName" | "commitHash" | "changesSummary">,
	): Promise<{ success: boolean; commitHash?: string; branchName?: string; prUrl?: string; error?: string }> {
		try {
			// First, create the commit
			const commitResult = await this.createCommit(commitOptions)
			if (!commitResult.success || !commitResult.commitHash || !commitResult.branchName) {
				return { success: false, error: "Failed to create commit" }
			}

			// Get changes summary for PR
			const changesSummary = await this.analyzeChanges()
			if (!changesSummary) {
				return { success: false, error: "No changes found for PR creation" }
			}

			// Create the PR
			const prResult = await this.createPullRequest({
				...prOptions,
				branchName: commitResult.branchName,
				commitHash: commitResult.commitHash,
				changesSummary,
			})

			if (!prResult.success) {
				return {
					success: false,
					commitHash: commitResult.commitHash,
					branchName: commitResult.branchName,
					error: "Commit created but PR creation failed",
				}
			}

			return {
				success: true,
				commitHash: commitResult.commitHash,
				branchName: commitResult.branchName,
				prUrl: prResult.prUrl,
			}
		} catch (error) {
			return {
				success: false,
				error: error instanceof GitServiceError ? error.message : `Unexpected error: ${error}`,
			}
		}
	}
}
