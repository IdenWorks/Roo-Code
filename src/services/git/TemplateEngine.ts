export interface TemplateVariables {
	[key: string]: any
}

export class TemplateEngine {
	/**
	 * Render a template string with the provided variables
	 */
	render(template: string, variables: TemplateVariables): string {
		let result = template

		// Replace simple variables: {{variableName}}
		result = result.replace(/\{\{([^#/}]+)\}\}/g, (match, variableName) => {
			const trimmedName = variableName.trim()

			// Handle array length access: {{arrayName.length}}
			if (trimmedName.endsWith(".length")) {
				const arrayName = trimmedName.slice(0, -7) // Remove '.length'
				const arrayValue = this.getNestedValue(variables, arrayName)
				if (Array.isArray(arrayValue)) {
					return arrayValue.length.toString()
				}
				return "0"
			}

			// Handle regular variable access
			const value = this.getNestedValue(variables, trimmedName)
			return this.formatValue(value)
		})

		// Handle conditional blocks: {{#if condition}}...{{/if}}
		result = this.processConditionals(result, variables)

		// Handle array iteration: {{#each array}}...{{/each}}
		result = this.processArrayIteration(result, variables)

		return result
	}

	/**
	 * Get nested value from variables object using dot notation
	 */
	private getNestedValue(obj: any, path: string): any {
		return path.split(".").reduce((current, key) => {
			return current && current[key] !== undefined ? current[key] : undefined
		}, obj)
	}

	/**
	 * Format a value for template output
	 */
	private formatValue(value: any): string {
		if (value === null || value === undefined) {
			return ""
		}
		if (typeof value === "string") {
			return value
		}
		if (typeof value === "number" || typeof value === "boolean") {
			return value.toString()
		}
		if (Array.isArray(value)) {
			return value.join(", ")
		}
		if (typeof value === "object") {
			return JSON.stringify(value)
		}
		return String(value)
	}

	/**
	 * Process conditional blocks in the template
	 */
	private processConditionals(template: string, variables: TemplateVariables): string {
		const conditionalRegex = /\{\{#if\s+([^}]+)\}\}([\s\S]*?)\{\{\/if\}\}/g

		return template.replace(conditionalRegex, (match, condition, content) => {
			const conditionValue = this.evaluateCondition(condition.trim(), variables)
			return conditionValue ? content : ""
		})
	}

	/**
	 * Process array iteration blocks in the template
	 */
	private processArrayIteration(template: string, variables: TemplateVariables): string {
		const eachRegex = /\{\{#each\s+([^}]+)\}\}([\s\S]*?)\{\{\/each\}\}/g

		return template.replace(eachRegex, (match, arrayName, content) => {
			const arrayValue = this.getNestedValue(variables, arrayName.trim())

			if (!Array.isArray(arrayValue)) {
				return ""
			}

			return arrayValue
				.map((item) => {
					// Replace {{this}} with the current item
					return content.replace(/\{\{this\}\}/g, this.formatValue(item))
				})
				.join("")
		})
	}

	/**
	 * Evaluate a condition for conditional blocks
	 */
	private evaluateCondition(condition: string, variables: TemplateVariables): boolean {
		// Handle array length conditions: arrayName.length
		if (condition.endsWith(".length")) {
			const arrayName = condition.slice(0, -7)
			const arrayValue = this.getNestedValue(variables, arrayName)
			return Array.isArray(arrayValue) && arrayValue.length > 0
		}

		// Handle simple variable existence/truthiness
		const value = this.getNestedValue(variables, condition)

		if (Array.isArray(value)) {
			return value.length > 0
		}

		if (typeof value === "string") {
			return value.length > 0
		}

		if (typeof value === "number") {
			return value !== 0
		}

		if (typeof value === "boolean") {
			return value
		}

		// For objects, check if they exist and are not empty
		if (typeof value === "object" && value !== null) {
			return Object.keys(value).length > 0
		}

		// Default: check for existence and truthiness
		return value !== null && value !== undefined && value !== false
	}

	/**
	 * Escape special characters for safe template rendering
	 */
	static escapeTemplateValue(value: string): string {
		return value
			.replace(/\\/g, "\\\\") // Escape backslashes
			.replace(/"/g, '\\"') // Escape double quotes
			.replace(/'/g, "\\'") // Escape single quotes
			.replace(/\n/g, "\\n") // Escape newlines
			.replace(/\r/g, "\\r") // Escape carriage returns
			.replace(/\t/g, "\\t") // Escape tabs
	}

	/**
	 * Validate template syntax
	 */
	static validateTemplate(template: string): { valid: boolean; errors: string[] } {
		const errors: string[] = []

		// Check for unmatched conditional blocks
		const ifMatches = template.match(/\{\{#if\s+[^}]+\}\}/g) || []
		const endIfMatches = template.match(/\{\{\/if\}\}/g) || []

		if (ifMatches.length !== endIfMatches.length) {
			errors.push(`Unmatched conditional blocks: ${ifMatches.length} {{#if}} but ${endIfMatches.length} {{/if}}`)
		}

		// Check for unmatched each blocks
		const eachMatches = template.match(/\{\{#each\s+[^}]+\}\}/g) || []
		const endEachMatches = template.match(/\{\{\/each\}\}/g) || []

		if (eachMatches.length !== endEachMatches.length) {
			errors.push(
				`Unmatched iteration blocks: ${eachMatches.length} {{#each}} but ${endEachMatches.length} {{/each}}`,
			)
		}

		// Check for malformed variable references
		const malformedVars = template.match(/\{\{[^}]*\{\{|\}\}[^}]*\}\}/g)
		if (malformedVars) {
			errors.push(`Malformed variable references found: ${malformedVars.join(", ")}`)
		}

		return {
			valid: errors.length === 0,
			errors,
		}
	}

	/**
	 * Get all variable names referenced in a template
	 */
	static extractVariableNames(template: string): string[] {
		const variables = new Set<string>()

		// Extract simple variables
		const simpleVarMatches = template.match(/\{\{([^#/}]+)\}\}/g) || []
		simpleVarMatches.forEach((match) => {
			const varName = match.replace(/\{\{|\}\}/g, "").trim()
			if (varName !== "this") {
				// Remove .length suffix if present
				const cleanName = varName.endsWith(".length") ? varName.slice(0, -7) : varName
				variables.add(cleanName.split(".")[0]) // Get root variable name
			}
		})

		// Extract conditional variables
		const conditionalMatches = template.match(/\{\{#if\s+([^}]+)\}\}/g) || []
		conditionalMatches.forEach((match) => {
			const condition = match.replace(/\{\{#if\s+|\}\}/g, "").trim()
			const cleanName = condition.endsWith(".length") ? condition.slice(0, -7) : condition
			variables.add(cleanName.split(".")[0])
		})

		// Extract each variables
		const eachMatches = template.match(/\{\{#each\s+([^}]+)\}\}/g) || []
		eachMatches.forEach((match) => {
			const arrayName = match.replace(/\{\{#each\s+|\}\}/g, "").trim()
			variables.add(arrayName.split(".")[0])
		})

		return Array.from(variables)
	}
}
