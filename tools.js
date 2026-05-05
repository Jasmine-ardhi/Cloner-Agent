import { exec } from "child_process";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import path from "path";

/**
 * Executes a shell command on the user's machine
 * @param {string} cmd - The command to run
 * @returns {Promise<string>} - stdout output or success message
 */
export async function executeCommand(cmd = "") {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: 15000 }, (error, stdout, stderr) => {
      if (error) {
        resolve(`Error: ${error.message}`);
      } else {
        resolve(stdout || `Command executed successfully: ${cmd}`);
      }
    });
  });
}

/**
 * Writes content to a file (creates folders if needed)
 * @param {string} filePath - Relative or absolute path to the file
 * @param {string} content - File content to write
 * @returns {string} - Success or error message
 */
export function writeFile(filePath = "", content = "") {
  try {
    const dir = path.dirname(filePath);
    if (dir && !existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(filePath, content, "utf-8");
    return `File written successfully: ${filePath}`;
  } catch (err) {
    return `Error writing file: ${err.message}`;
  }
}

/**
 * Creates a directory (and any nested parents)
 * @param {string} dirPath - Path of the directory to create
 * @returns {string} - Success or error message
 */
export function createDirectory(dirPath = "") {
  try {
    mkdirSync(dirPath, { recursive: true });
    return `Directory created: ${dirPath}`;
  } catch (err) {
    return `Error creating directory: ${err.message}`;
  }
}

// Map of all available tools
export const tool_map = {
  executeCommand,
  writeFile,
  createDirectory,
};

// Tool descriptions for the system prompt
export const toolDescriptions = `
Available Tools:
1. executeCommand(cmd: string)
   - Executes any shell/terminal command on the user's machine
   - Use for: running scripts, opening files, checking directories

2. writeFile(filePath: string, content: string)
   - Writes text content to a file at the given path
   - Creates parent directories automatically
   - Use for: saving HTML, CSS, JS files

3. createDirectory(dirPath: string)
   - Creates a new directory (with nested parents if needed)
   - Use for: setting up project folder structure
`;