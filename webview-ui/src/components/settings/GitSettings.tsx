import { VSCodeButton, VSCodeCheckbox, VSCodeTextArea, VSCodeTextField } from "@vscode/webview-ui-toolkit/react"
import { GitPullRequest } from "lucide-react"
import { HTMLAttributes, useState } from "react"
import { Section } from "./Section"
import { SectionHeader } from "./SectionHeader"
import { SetCachedStateField } from "./types"

type GitSettingsProps = HTMLAttributes<HTMLDivElement> & {
	gitAutoCommitEnabled?: boolean
	gitCommitMessageTemplate?: string
	gitPrTitleTemplate?: string
	gitPrBodyTemplate?: string
	gitBranchPrefix?: string
	gitRequireCleanWorkingDirectory?: boolean
	setCachedStateField: SetCachedStateField<
		| "gitAutoCommitEnabled"
		| "gitCommitMessageTemplate"
		| "gitPrTitleTemplate"
		| "gitPrBodyTemplate"
		| "gitBranchPrefix"
		| "gitRequireCleanWorkingDirectory"
	>
}

const DEFAULT_COMMIT_MESSAGE_TEMPLATE = `{{changeType}}: {{taskDescription}}

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

const DEFAULT_PR_TITLE_TEMPLATE = `{{changeType}}: {{taskDescription}}`

const DEFAULT_PR_BODY_TEMPLATE = `## Task Completion

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

export const GitSettings = ({
	gitAutoCommitEnabled,
	gitCommitMessageTemplate,
	gitPrTitleTemplate,
	gitPrBodyTemplate,
	gitBranchPrefix,
	gitRequireCleanWorkingDirectory,
	setCachedStateField,
	...props
}: GitSettingsProps) => {
	const [showTemplateHelp, setShowTemplateHelp] = useState(false)

	const resetToDefaults = () => {
		setCachedStateField("gitCommitMessageTemplate", DEFAULT_COMMIT_MESSAGE_TEMPLATE)
		setCachedStateField("gitPrTitleTemplate", DEFAULT_PR_TITLE_TEMPLATE)
		setCachedStateField("gitPrBodyTemplate", DEFAULT_PR_BODY_TEMPLATE)
		setCachedStateField("gitBranchPrefix", "otto-task")
	}

	const templateVariables = [
		{ name: "taskId", description: "Unique task identifier" },
		{ name: "taskDescription", description: "Description of the completed task" },
		{ name: "changeType", description: "Semantic type: feat, fix, docs, style, refactor, test, chore" },
		{ name: "addedFiles", description: "List of newly added files" },
		{ name: "modifiedFiles", description: "List of modified files" },
		{ name: "deletedFiles", description: "List of deleted files" },
		{ name: "renamedFiles", description: "List of renamed files with from/to properties" },
		{ name: "totalChanges", description: "Total number of changed files" },
		{ name: "timestamp", description: "ISO timestamp of completion" },
		{ name: "branchName", description: "Generated branch name" },
		{ name: "commitHash", description: "Git commit hash (available in PR templates)" },
	]

	return (
		<div {...props}>
			<SectionHeader>
				<div className="flex items-center gap-2">
					<GitPullRequest className="w-4" />
					<div>Git Auto-Commit</div>
				</div>
			</SectionHeader>

			<Section>
				<div>
					<VSCodeCheckbox
						checked={gitAutoCommitEnabled}
						onChange={(e: any) => setCachedStateField("gitAutoCommitEnabled", e.target.checked)}>
						<span className="font-medium">Enable Git Auto-Commit</span>
					</VSCodeCheckbox>
					<div className="text-vscode-descriptionForeground text-sm mt-1">
						Automatically commit changes and create GitHub pull requests when tasks are completed. Requires
						git and GitHub CLI (gh) to be installed and authenticated.
					</div>
				</div>

				{gitAutoCommitEnabled && (
					<div className="flex flex-col gap-4 pl-3 border-l-2 border-vscode-button-background">
						<div>
							<label className="block font-medium mb-1">Branch Prefix</label>
							<VSCodeTextField
								value={gitBranchPrefix || "otto-task"}
								onChange={(e: any) => setCachedStateField("gitBranchPrefix", e.target.value)}
								placeholder="otto-task"
								style={{ width: "100%" }}
							/>
							<div className="text-vscode-descriptionForeground text-sm mt-1">
								Prefix for automatically generated branch names. Format:{" "}
								{gitBranchPrefix || "otto-task"}-{"{taskId}"}-{"{timestamp}"}
							</div>
						</div>

						<div>
							<VSCodeCheckbox
								checked={gitRequireCleanWorkingDirectory}
								onChange={(e: any) =>
									setCachedStateField("gitRequireCleanWorkingDirectory", e.target.checked)
								}>
								<span className="font-medium">Require Clean Working Directory</span>
							</VSCodeCheckbox>
							<div className="text-vscode-descriptionForeground text-sm mt-1">
								Only commit if the working directory is clean (no uncommitted changes).
							</div>
						</div>

						<div className="flex justify-between items-center">
							<h3 className="font-medium">Templates</h3>
							<div className="flex gap-2">
								<VSCodeButton
									appearance="secondary"
									onClick={() => setShowTemplateHelp(!showTemplateHelp)}>
									{showTemplateHelp ? "Hide" : "Show"} Template Variables
								</VSCodeButton>
								<VSCodeButton appearance="secondary" onClick={resetToDefaults}>
									Reset to Defaults
								</VSCodeButton>
							</div>
						</div>

						{showTemplateHelp && (
							<div className="bg-vscode-editor-background p-3 rounded border">
								<h4 className="font-medium mb-2">Available Template Variables</h4>
								<div className="text-sm space-y-1">
									{templateVariables.map((variable) => (
										<div key={variable.name} className="flex">
											<code className="text-vscode-textPreformat-foreground bg-vscode-textCodeBlock-background px-1 rounded mr-2 min-w-fit">
												{`{{${variable.name}}}`}
											</code>
											<span className="text-vscode-descriptionForeground">
												{variable.description}
											</span>
										</div>
									))}
								</div>
								<div className="mt-3 text-sm text-vscode-descriptionForeground">
									<p className="mb-1">
										<strong>Conditional blocks:</strong>{" "}
										<code>{`{{#if condition}}...{{/if}}`}</code>
									</p>
									<p className="mb-1">
										<strong>Array iteration:</strong> <code>{`{{#each array}}...{{/each}}`}</code>
									</p>
									<p>
										<strong>Array length:</strong> <code>{`{{arrayName.length}}`}</code>
									</p>
								</div>
							</div>
						)}

						<div>
							<label className="block font-medium mb-1">Commit Message Template</label>
							<VSCodeTextArea
								value={gitCommitMessageTemplate || DEFAULT_COMMIT_MESSAGE_TEMPLATE}
								onChange={(e: any) => setCachedStateField("gitCommitMessageTemplate", e.target.value)}
								placeholder={DEFAULT_COMMIT_MESSAGE_TEMPLATE}
								rows={8}
								style={{ width: "100%", fontFamily: "monospace" }}
							/>
							<div className="text-vscode-descriptionForeground text-sm mt-1">
								Template for git commit messages. Use template variables for dynamic content.
							</div>
						</div>

						<div>
							<label className="block font-medium mb-1">PR Title Template</label>
							<VSCodeTextField
								value={gitPrTitleTemplate || DEFAULT_PR_TITLE_TEMPLATE}
								onChange={(e: any) => setCachedStateField("gitPrTitleTemplate", e.target.value)}
								placeholder={DEFAULT_PR_TITLE_TEMPLATE}
								style={{ width: "100%", fontFamily: "monospace" }}
							/>
							<div className="text-vscode-descriptionForeground text-sm mt-1">
								Template for GitHub pull request titles.
							</div>
						</div>

						<div>
							<label className="block font-medium mb-1">PR Body Template</label>
							<VSCodeTextArea
								value={gitPrBodyTemplate || DEFAULT_PR_BODY_TEMPLATE}
								onChange={(e: any) => setCachedStateField("gitPrBodyTemplate", e.target.value)}
								placeholder={DEFAULT_PR_BODY_TEMPLATE}
								rows={12}
								style={{ width: "100%", fontFamily: "monospace" }}
							/>
							<div className="text-vscode-descriptionForeground text-sm mt-1">
								Template for GitHub pull request descriptions. Supports Markdown formatting.
							</div>
						</div>

						<div className="bg-vscode-textBlockQuote-background p-3 rounded border-l-4 border-vscode-textBlockQuote-border">
							<h4 className="font-medium mb-2">Prerequisites</h4>
							<ul className="text-sm text-vscode-descriptionForeground space-y-1">
								<li>• Git must be installed and available in PATH</li>
								<li>• GitHub CLI (gh) must be installed and authenticated</li>
								<li>• Repository must have a remote origin configured</li>
								<li>• Must be in a git repository</li>
							</ul>
							<p className="text-sm text-vscode-descriptionForeground mt-2">
								Run{" "}
								<code className="bg-vscode-textCodeBlock-background px-1 rounded">gh auth login</code>{" "}
								to authenticate GitHub CLI.
							</p>
						</div>
					</div>
				)}
			</Section>
		</div>
	)
}
