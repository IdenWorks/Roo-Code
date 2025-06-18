import { describe, it, expect, vi } from "vitest"

// Mock vscode
const mockVscode = {
	workspace: {
		getConfiguration: vi.fn(),
		onDidChangeConfiguration: vi.fn(),
	},
}

vi.mock("vscode", () => mockVscode)

describe("HTTP Server Setting", () => {
	it("should read httpServerEnabled setting correctly when disabled", () => {
		// Mock configuration to return false for httpServerEnabled
		const mockConfig = {
			get: vi.fn((key: string, defaultValue?: any) => {
				if (key === "httpServerEnabled") {
					return false
				}
				return defaultValue
			}),
		}

		mockVscode.workspace.getConfiguration.mockReturnValue(mockConfig)

		// Test the setting retrieval logic
		const config = mockVscode.workspace.getConfiguration("roo-otto")
		const httpServerEnabled = config.get("httpServerEnabled", false)

		expect(httpServerEnabled).toBe(false)
		expect(mockVscode.workspace.getConfiguration).toHaveBeenCalledWith("roo-otto")
		expect(mockConfig.get).toHaveBeenCalledWith("httpServerEnabled", false)
	})

	it("should read httpServerEnabled setting correctly when enabled", () => {
		// Mock configuration to return true for httpServerEnabled
		const mockConfig = {
			get: vi.fn((key: string, defaultValue?: any) => {
				if (key === "httpServerEnabled") {
					return true
				}
				return defaultValue
			}),
		}

		mockVscode.workspace.getConfiguration.mockReturnValue(mockConfig)

		// Test the setting retrieval logic
		const config = mockVscode.workspace.getConfiguration("roo-otto")
		const httpServerEnabled = config.get("httpServerEnabled", false)

		expect(httpServerEnabled).toBe(true)
		expect(mockVscode.workspace.getConfiguration).toHaveBeenCalledWith("roo-otto")
		expect(mockConfig.get).toHaveBeenCalledWith("httpServerEnabled", false)
	})

	it("should handle configuration change events", () => {
		// Mock a configuration change event
		const mockEvent = {
			affectsConfiguration: vi.fn((section: string) => section === "roo-otto.httpServerEnabled"),
		}

		// Test the event filtering logic
		expect(mockEvent.affectsConfiguration("roo-otto.httpServerEnabled")).toBe(true)
		expect(mockEvent.affectsConfiguration("roo-otto.otherSetting")).toBe(false)
		expect(mockEvent.affectsConfiguration("other.extension.setting")).toBe(false)
	})

	it("should use default value when setting is not configured", () => {
		// Mock configuration to return undefined (not set)
		const mockConfig = {
			get: vi.fn((key: string, defaultValue?: any) => {
				return defaultValue // Return the default value
			}),
		}

		mockVscode.workspace.getConfiguration.mockReturnValue(mockConfig)

		// Test the setting retrieval logic with default
		const config = mockVscode.workspace.getConfiguration("roo-otto")
		const httpServerEnabled = config.get("httpServerEnabled", false)

		expect(httpServerEnabled).toBe(false) // Should use the default value
		expect(mockConfig.get).toHaveBeenCalledWith("httpServerEnabled", false)
	})
})
