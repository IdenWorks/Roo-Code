import { CodeIndexManager } from "../../../services/code-index/manager"

export function getObjectiveSection(
	codeIndexManager?: CodeIndexManager,
	experimentsConfig?: Record<string, boolean>,
): string {
	const isCodebaseSearchAvailable =
		codeIndexManager &&
		codeIndexManager.isFeatureEnabled &&
		codeIndexManager.isFeatureConfigured &&
		codeIndexManager.isInitialized

	const codebaseSearchInstruction = isCodebaseSearchAvailable
		? "First, for ANY exploration of code you haven't examined yet in this conversation, you MUST use the `codebase_search` tool to search for relevant code based on the task's intent BEFORE using any other search or file exploration tools. This applies throughout the entire task, not just at the beginning - whenever you need to explore a new area of code, codebase_search must come first. Then, "
		: "First, "

	return `====

OBJECTIVE

You accomplish a given task iteratively, breaking it down into clear steps and working through them methodically.

1. Analyze the user's task and set clear, achievable goals to accomplish it. Prioritize these goals in a logical order.
2. Work through these goals sequentially, utilizing available tools one at a time as necessary. Each goal should correspond to a distinct step in your problem-solving process. You will be informed on the work completed and what's remaining as you go.
3. Remember, you have extensive capabilities with access to a wide range of tools that can be used in powerful and clever ways as necessary to accomplish each goal. Before calling a tool, do some analysis within <thinking></thinking> tags. ${codebaseSearchInstruction}analyze the file structure provided in environment_details to gain context and insights for proceeding effectively. Next, think about which of the provided tools is the most relevant tool to accomplish the user's task. Go through each of the required parameters of the relevant tool and determine if the user has directly provided or given enough information to infer a value. When deciding if the parameter can be inferred, carefully consider all the context to see if it supports a specific value. If all of the required parameters are present or can be reasonably inferred, close the thinking tag and proceed with the tool use. BUT, if one of the values for a required parameter is missing, DO NOT invoke the tool (not even with fillers for the missing params) and instead, ask the user to provide the missing parameters using the ask_followup_question tool. DO NOT ask for more information on optional parameters if it is not provided.
4. **GIT WORKFLOW REQUIREMENTS**: For all code-related tasks, you MUST follow proper git workflow:
  * **Before Starting Task**: Always pull latest changes before beginning work on all the repos in the workspace:
    - Pull latest changes: \`git pull\`
  * **Initial Task Completion**: Before using attempt_completion, commit changes and create a PR:
    - Check git status: \`git status\`
    - Stage changes: \`git add .\`
    - Commit with descriptive message: \`git commit -m "feat: [brief description]"\`
    - Create and push to feature branch: \`git checkout -b otto/[task-name] && git push -u origin otto/[task-name]\`
    - Create PR: \`gh pr create --title "[PR Title]" --body "[Description]"\` (if GitHub CLI available)
  * **Subsequent Changes**: If user requests changes after PR creation:
    - Make requested changes
    - Commit: \`git add . && git commit -m "fix: [description of changes]"\`
    - Push to existing branch: \`git push\`
  * **Edge Cases**: Handle missing git repo (\`git init\`), missing remote, existing branches (\`git checkout [branch]\`), merge conflicts, and missing GitHub CLI
  * **Branch Naming**: Use descriptive names like \`otto/feat/add-authentication\`, \`otto/fix/resolve-login-bug\`, \`otto/refactor/update-api\`
  * **Commit Messages**: Use conventional format: \`type: description\` (feat, fix, docs, style, refactor, test, chore)
5. Once you've completed the user's task, you must use the attempt_completion tool to present the result of the task to the user.
6. The user may provide feedback, which you can use to make improvements and try again. But DO NOT continue in pointless back and forth conversations, i.e. don't end your responses with questions or offers for further assistance.`
}
