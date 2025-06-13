import { EXPERIMENT_IDS, experiments } from "../../../shared/experiments"
import { ToolArgs } from "./types"

export function getAttemptCompletionDescription(args?: ToolArgs): string {
	// Check if command execution is disabled via experiment
	const isCommandDisabled =
		args?.experiments && experiments.isEnabled(args.experiments, EXPERIMENT_IDS.DISABLE_COMPLETION_COMMAND)

	const baseDescription = `## attempt_completion
Description: After each tool use, the user will respond with the result of that tool use, i.e. if it succeeded or failed, along with any reasons for failure. Once you've received the results of tool uses and can confirm that the task is complete, use this tool to present the result of your work to the user.${!isCommandDisabled ? " Optionally you may provide a CLI command to showcase the result of your work." : ""} The user may respond with feedback if they are not satisfied with the result, which you can use to make improvements and try again.
IMPORTANT NOTE: This tool CANNOT be used until you've confirmed from the user that any previous tool uses were successful. Failure to do so will result in code corruption and system failure. Before using this tool, you must ask yourself in <thinking></thinking> tags if you've confirmed from the user that any previous tool uses were successful. If not, then DO NOT use this tool.

GIT WORKFLOW REQUIREMENTS:
When completing a task that involves code changes, you MUST follow this git workflow:

1. **Initial Task Completion**: After making all necessary changes and before using attempt_completion, commit your changes and create a pull request:
   - Stage all changes: \`git add .\`
   - Commit with a descriptive message: \`git commit -m "feat: [brief description of changes]"\`
   - Push to a new feature branch: \`git push -u origin otto/feature/[task-description]\`
   - Create a pull request: \`gh pr create --title "[PR Title]" --body "[PR Description]"\`

2. **Subsequent Changes After PR**: If the user requests additional changes after the PR has been created:
   - Make the requested changes
   - Stage and commit: \`git add . && git commit -m "fix: [description of additional changes]"\`
   - Push to the existing branch: \`git push\`
   - Do NOT create a new PR - the existing PR will be updated automatically

3. **Edge Cases to Handle**:
   - If the branch already exists, switch to it: \`git checkout [branch-name]\`
   - If there are merge conflicts, resolve them before proceeding
   - If GitHub CLI is not available, provide manual instructions for creating PR
   - If working on an existing PR branch, continue using that branch

4. **Branch Naming Convention**:
   - Use descriptive branch names: \`otto/feature/add-user-authentication\`, \`otto/fix/resolve-login-bug\`, \`otto/refactor/update-api-endpoints\`
   - Keep branch names concise but meaningful

5. **Commit Message Format**:
   - Use conventional commit format: \`type: description\`
   - Types: feat, fix, docs, style, refactor, test, chore
   - Example: \`feat: add user authentication system\`

IMPORTANT: Always execute the git commands using the execute_command tool before using attempt_completion. The git workflow is mandatory for all code-related tasks.

Parameters:
- result: (required) The result of the task. Formulate this result in a way that is final and does not require further input from the user. Don't end your result with questions or offers for further assistance.`

	const commandParameter = !isCommandDisabled
		? `
- command: (optional) A CLI command to execute to show a live demo of the result to the user. For example, use \`open index.html\` to display a created html website, or \`open localhost:3000\` to display a locally running development server. But DO NOT use commands like \`echo\` or \`cat\` that merely print text. This command should be valid for the current operating system. Ensure the command is properly formatted and does not contain any harmful instructions.`
		: ""

	const usage = `
Usage:
<attempt_completion>
<result>
Your final result description here
</result>${!isCommandDisabled ? "\n<command>Command to demonstrate result (optional)</command>" : ""}
</attempt_completion>`

	const example = !isCommandDisabled
		? `

Example: Requesting to attempt completion with a result and command
<attempt_completion>
<result>
I've updated the CSS and committed the changes to a new feature branch. Created PR #123 for review.
</result>
<command>open index.html</command>
</attempt_completion>`
		: `

Example: Requesting to attempt completion with a result
<attempt_completion>
<result>
I've updated the CSS
</result>
</attempt_completion>`

	return baseDescription + commandParameter + usage + example
}
