

import "dotenv/config";
import OpenAI from "openai";
import readline from "readline";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { exec } from "child_process";

// ── Terminal colours ──────────────────────────
const c = {
  reset:"\x1b[0m", bold:"\x1b[1m", dim:"\x1b[2m",
  cyan:"\x1b[36m", yellow:"\x1b[33m", green:"\x1b[32m",
  blue:"\x1b[34m", magenta:"\x1b[35m", red:"\x1b[31m", white:"\x1b[37m",
};
const fmt = {
  step:(label,color) => `${color}${c.bold}[${label}]${c.reset}`,
  divider:() => `${c.dim}${"─".repeat(60)}${c.reset}`,
  ok:(msg) => `  ${c.green}✓ ${msg}${c.reset}`,
  info:(msg) => `  ${c.cyan}● ${msg}${c.reset}`,
};

// ── File system tools ─────────────────────────
function createDirectory(dirPath="") {
  try {
    mkdirSync(dirPath, { recursive:true });
    return `Directory created: ${dirPath}`;
  } catch(e) { return `Error: ${e.message}`; }
}

function writeFile(filePath="", content="") {
  try {
    if(!filePath) return "Error: filePath is required";
    if(!content || content.trim().length < 5) return "Error: content is empty";
    const parts = filePath.split("/");
    if(parts.length > 1) {
      const dir = parts.slice(0,-1).join("/");
      if(!existsSync(dir)) mkdirSync(dir, { recursive:true });
    }
    writeFileSync(filePath, content, "utf-8");
    return `File written: ${filePath} (${content.length} bytes)`;
  } catch(e) { return `Error: ${e.message}`; }
}

function executeCommand(cmd="") {
  return new Promise((res) => {
    exec(cmd, { timeout:10000 }, (err, stdout, stderr) => {
      if(err) res(`Error: ${err.message}`);
      else res(stdout || stderr || `Done: ${cmd}`);
    });
  });
}

// ── JSON extractor ────────────────────────────
function extractJSON(raw="") {
  const clean = raw.replace(/```json/gi,"").replace(/```/g,"").trim();
  try { return JSON.parse(clean); } catch {}
  const s = clean.indexOf("{"), e = clean.lastIndexOf("}");
  if(s !== -1 && e > s) { try { return JSON.parse(clean.slice(s,e+1)); } catch {} }
  throw new Error("No JSON found in: " + raw.slice(0,150));
}

// ── Dedicated code generator (big token budget, focused prompt) ──
async function generateCode(client, type, description) {
  console.log(fmt.info(`Generating ${type.toUpperCase()} → ${description.slice(0,70)}...`));

  const systemPrompts = {
    html: `You are an expert HTML developer. Output ONLY raw HTML. No markdown, no backticks, no explanation.
STRICT RULES:
- Output a complete HTML file with <!DOCTYPE html> ... </html>
- Add <link rel="stylesheet" href="style.css"/> inside <head>
- Add <script src="script.js"></script> just before </body>
- Do NOT write any <style> tags or <script> tags with code inside the HTML
- Do NOT inline any CSS or JavaScript — all goes in separate files
- Use semantic HTML5 tags: <nav>, <header>, <main>, <section>, <footer>
- Add proper class names on every element (they will be styled by style.css)
- Use Google Fonts <link> in <head>
- Include placeholder text, realistic content, images from https://via.placeholder.com`,

    css: `You are an expert CSS developer. Output ONLY raw CSS. No markdown, no backticks, no explanation.
STRICT RULES:
- Output pure CSS only — no HTML, no JavaScript
- Use CSS custom properties (variables) at :root for colors, fonts, spacing
- Use flexbox and CSS grid for layouts
- Add smooth transitions and hover effects on interactive elements
- Make it fully responsive with media queries for mobile (max-width: 768px)
- Add keyframe animations for hero section entrance
- Style every class name mentioned in the HTML exactly
- Dark theme unless told otherwise`,

    js: `You are an expert JavaScript developer. Output ONLY raw JavaScript. No markdown, no backticks, no explanation.
STRICT RULES:
- Output pure JS only — no HTML, no CSS
- Use document.addEventListener('DOMContentLoaded', ...) to wrap everything
- Every feature described must be FULLY implemented — no stubs, no TODOs
- Use querySelector, addEventListener, classList — modern vanilla JS only
- For todo apps: implement add task, delete task, mark complete, filter (all/active/done), count
- For website clones: implement sticky navbar shadow on scroll, mobile hamburger menu, scroll reveal animations
- Keep it simple and working — 50-150 lines max`,
  };

  const res = await client.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_tokens: type === "html" ? 6000 : type === "css" ? 5000 : 2000,
    temperature: 0.2,
    messages: [
      { role:"system", content: systemPrompts[type] || systemPrompts.html },
      { role:"user",   content: `${description}\n\nOutput ONLY the raw ${type.toUpperCase()} code. Nothing else.` }
    ]
  });

  let code = res.choices[0].message.content.trim();
  // Strip any accidental markdown fences
  code = code.replace(/^```[\w]*\s*/gi,"").replace(/\s*```$/g,"").trim();
  return code;
}

// ── System prompt for reasoning loop ─────────
const SYSTEM_PROMPT = `You are an AI CLI Agent that works like Cursor or Windsurf.
You reason step-by-step, take actions using tools, and produce real output files.

CRITICAL OUTPUT RULE: Respond with ONLY a raw JSON object every time. No markdown. No backticks. No explanation outside JSON.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEPS (emit exactly ONE per response)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
START   → Understand and restate the user's full task
THINK   → Reason about the very next action to take
TOOL    → Call one tool to take that action
OUTPUT  → Final summary after all files are written

Always wait for OBSERVE after every TOOL before emitting the next step.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOOLS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. generateCode
   Generates code for ONE file type. Result is stored and injected by the next writeFile.
   args: { "type": "html" | "css" | "js",  "description": "very detailed spec" }

2. createDirectory
   args: { "dirPath": "folder_name" }

3. writeFile
   Writes the last generated code to disk. Always use "%%CODE%%" as content.
   args: { "filePath": "folder/file.ext", "content": "%%CODE%%" }

4. executeCommand
   args: { "cmd": "shell command" }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MANDATORY FILE STRUCTURE (follow exactly)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALWAYS produce exactly 3 files:
  folder/index.html  — structure only, links to style.css and script.js
  folder/style.css   — all styling
  folder/script.js   — all interactivity

NEVER put CSS or JS inside the HTML file.
The HTML file must have <link rel="stylesheet" href="style.css"/> and <script src="script.js"></script>.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MANDATORY STEP SEQUENCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1.  START  — restate the task clearly
2.  THINK  — "I will create folder X with index.html, style.css, script.js"
3.  TOOL   — createDirectory
4.  THINK  — describe what sections the HTML will have (navbar, hero, section, footer etc.)
5.  TOOL   — generateCode type=html (describe every section, every class name, every element)
6.  TOOL   — writeFile index.html
7.  THINK  — describe the exact CSS rules needed (colors, layout, animations, responsive)
8.  TOOL   — generateCode type=css (describe every selector, color, animation, breakpoint)
9.  TOOL   — writeFile style.css
10. THINK  — describe the exact JS behaviour needed (what events, what DOM changes)
11. TOOL   — generateCode type=js (describe every feature in detail)
12. TOOL   — writeFile script.js
13. OUTPUT — list all 3 files created and tell user to open index.html

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
generateCode DESCRIPTION QUALITY RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The "description" must be VERY detailed. Bad vs Good examples:

BAD  → "HTML for Scaler website"
GOOD → "HTML for Scaler Academy clone. Navbar: logo 'S' icon + 'Scaler.' text, links: Programs/Topics/Mentors/Alumni/Events/Blog, Login button, Apply Now CTA button, hamburger for mobile. Hero: badge '#1 Tech Platform', h1 'Become a Better Engineer', subtext, 3 stats (900% hike, 70K+ alumni, 700+ partners), two CTA buttons (Explore Programs + Free Live Class), right side card showing student progress. Programs section: 3 cards (Software Dev, ML/AI, Data Science). Footer: 4 columns (brand+social, Company, Programs, Support), copyright bar."

BAD  → "CSS for todo app"
GOOD → "CSS for todo app. Variables: --bg:#1a1a2e, --surface:#16213e, --brand:#e94560, --text:#eee, --muted:#888, --radius:12px. Body: dark bg, centered layout max-width 500px. Header: gradient brand title. Input row: flex, text input + Add button (brand color, hover darken). Todo list: flex column gap 8px. Todo item: flex, align-center, surface bg, radius, padding 14px, hover lift shadow. Checkbox: custom styled. Delete button: red, appears on hover. Completed item: line-through, muted color. Filter tabs: 3 buttons (All/Active/Done), active tab gets brand underline. Counter: muted small text."

BAD  → "JS for todo"
GOOD → "JS for todo app. State: todos array [{id, text, done}]. On DOMContentLoaded: load from localStorage, render. addTodo(): read input value, trim, push to state, save, render, clear input. deleteTodo(id): filter state, save, render. toggleTodo(id): flip done, save, render. render(): filter todos by activeFilter (all/active/done), clear list, forEach create item div with checkbox+span+deleteBtn, append. Filter buttons: click sets activeFilter, re-render, update active class. Counter: shows X tasks left. Save: JSON.stringify to localStorage key 'todos'."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
JSON SCHEMA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{ "step": "START",  "content": "string" }
{ "step": "THINK",  "content": "string" }
{ "step": "TOOL",   "tool_name": "generateCode",    "tool_args": { "type": "html|css|js", "description": "detailed spec" } }
{ "step": "TOOL",   "tool_name": "createDirectory", "tool_args": { "dirPath": "string" } }
{ "step": "TOOL",   "tool_name": "writeFile",       "tool_args": { "filePath": "folder/file.ext", "content": "%%CODE%%" } }
{ "step": "OUTPUT", "content": "string" }`;

// ── Print helpers ─────────────────────────────
function printStep(parsed) {
  console.log("");
  switch(parsed.step) {
    case "START":
      console.log(fmt.step(" START", c.blue));
      console.log(`  ${c.white}${parsed.content}${c.reset}`);
      break;
    case "THINK":
      console.log(fmt.step(" THINK", c.yellow));
      console.log(`  ${c.dim}${parsed.content}${c.reset}`);
      break;
    case "TOOL":
      console.log(fmt.step("  TOOL", c.magenta));
      if(parsed.tool_name === "generateCode") {
        const t = (parsed.tool_args?.type||"code").toUpperCase();
        console.log(`  ${c.magenta}generateCode${c.reset} → ${c.bold}${t}${c.reset}`);
        const desc = parsed.tool_args?.description||"";
        console.log(`  ${c.dim}${desc.slice(0,100)}${desc.length>100?"…":""}${c.reset}`);
      } else if(parsed.tool_name === "writeFile") {
        console.log(`  ${c.magenta}writeFile${c.reset} → ${c.bold}${c.white}${parsed.tool_args?.filePath||""}${c.reset}`);
      } else if(parsed.tool_name === "createDirectory") {
        console.log(`  ${c.magenta}createDirectory${c.reset} → ${c.bold}${parsed.tool_args?.dirPath||""}${c.reset}`);
      } else {
        console.log(`  ${c.magenta}${parsed.tool_name}${c.reset}`);
        const a = JSON.stringify(parsed.tool_args||"");
        console.log(`  ${c.dim}${a.slice(0,100)}${c.reset}`);
      }
      break;
    case "OUTPUT":
      console.log("");
      console.log(`${c.green}${"═".repeat(60)}${c.reset}`);
      console.log(fmt.step(" DONE!", c.green));
      console.log(`  ${c.green}${c.bold}${parsed.content}${c.reset}`);
      console.log(`${c.green}${"═".repeat(60)}${c.reset}`);
      break;
    default:
      console.log(`  ${c.dim}${JSON.stringify(parsed)}${c.reset}`);
  }
}

function printObserve(result) {
  const str = String(result);
  const isOk = str.startsWith("File written") || str.startsWith("Directory") || str.includes("bytes");
  console.log(`\n${fmt.step("OBSERVE", isOk ? c.green : c.cyan)}`);
  console.log(`  ${isOk ? c.green : c.cyan}${str.slice(0,140)}${str.length>140?"…":""}${c.reset}`);
}

function printBanner() {
  console.log(`
${c.yellow}${c.bold}
  ╔══════════════════════════════════════════╗
  ║        SCALER AGENT  ⚡  Groq            ║
  ║     AI-Powered CLI — Assignment 02       ║
  ╚══════════════════════════════════════════╝
${c.reset}
  ${c.white}Try:${c.reset}
  ${c.cyan}→${c.reset} Clone the Scaler Academy website
  ${c.cyan}→${c.reset} Create a todo app in HTML CSS and JS
  ${c.cyan}→${c.reset} Build a calculator app
  ${c.cyan}→${c.reset} Make a weather dashboard UI

  ${c.dim}Creates: index.html + style.css + script.js in a new folder${c.reset}
  ${c.dim}Type exit to quit${c.reset}
`);
}

// ── Main agent loop ───────────────────────────
async function runAgent(client, userMessage) {
  console.log("\n" + fmt.divider());
  console.log(`${c.bold}${c.white}You:${c.reset} ${userMessage}`);
  console.log(fmt.divider());

  const messages = [
    { role:"system", content:SYSTEM_PROMPT },
    { role:"user",   content:userMessage },
  ];

  let lastCode = null; // stores last generateCode output, consumed by writeFile

  let i = 0;
  while(i++ < 40) {

    // Reasoning call — small tokens, just decides next step
    let rawContent;
    try {
      const res = await client.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        max_tokens: 500,
        temperature: 0.2,
        response_format: { type:"json_object" },
        messages,
      });
      rawContent = res.choices[0].message.content;
    } catch(err) {
      console.error(`\n${c.red}[API ERROR] ${err.message}${c.reset}`); break;
    }

    let parsed;
    try {
      parsed = extractJSON(rawContent);
    } catch(err) {
      console.error(`\n${c.red}[PARSE ERROR] ${err.message}${c.reset}`);
      messages.push({ role:"user", content:JSON.stringify({ step:"OBSERVE", content:"ERROR: respond with ONLY a raw JSON object" }) });
      continue;
    }

    printStep(parsed);
    messages.push({ role:"assistant", content:JSON.stringify(parsed) });
    if(parsed.step === "OUTPUT") break;

    if(parsed.step === "TOOL") {
      const toolName = parsed.tool_name;
      const args = parsed.tool_args || {};
      let obs = "";

      // ── generateCode: big dedicated LLM call
      if(toolName === "generateCode") {
        const type = (args.type || "html").toLowerCase();
        const desc = args.description || "";
        if(!desc) {
          obs = "Error: generateCode requires a 'description' field";
        } else {
          try {
            lastCode = await generateCode(client, type, desc);
            obs = `Code generated: ${lastCode.length} bytes of ${type.toUpperCase()} — ready for writeFile`;
            console.log(fmt.ok(`${type.toUpperCase()} generated (${lastCode.length} bytes)`));
          } catch(err) {
            obs = `Code generation error: ${err.message}`;
          }
        }
      }

      // ── createDirectory
      else if(toolName === "createDirectory") {
        const dirPath = typeof args==="string" ? args : (args.dirPath||args.dir||args.path||"");
        obs = createDirectory(dirPath);
        if(obs.startsWith("Directory")) console.log(fmt.ok(`Folder created: ${dirPath}`));
      }

      // ── writeFile — injects lastCode
      else if(toolName === "writeFile") {
        const filePath = typeof args==="string" ? "" : (args.filePath||args.file_path||args.path||"");
        let content    = typeof args==="string" ? "" : (args.content||"");

        if(content.includes("%%CODE%%") || content.trim().length < 20) {
          if(lastCode) {
            content  = lastCode;
            lastCode = null;
          } else {
            obs = "Error: No generated code to write. Call generateCode first.";
            printObserve(obs);
            messages.push({ role:"user", content:JSON.stringify({ step:"OBSERVE", content:obs }) });
            continue;
          }
        }

        obs = writeFile(filePath, content);
        if(obs.startsWith("File written")) {
          const ext = filePath.split(".").pop().toUpperCase();
          console.log(fmt.ok(`${ext} saved → ${filePath}`));
        }
      }

      // ── executeCommand
      else if(toolName === "executeCommand") {
        const cmd = typeof args==="string" ? args : (args.cmd||args.command||"");
        obs = await executeCommand(cmd);
      }

      else {
        obs = `Unknown tool: "${toolName}". Use: generateCode, createDirectory, writeFile, executeCommand`;
      }

      printObserve(obs);
      messages.push({ role:"user", content:JSON.stringify({ step:"OBSERVE", content:obs }) });
    }
  }
}

// ── REPL ──────────────────────────────────────
async function main() {
  const apiKey = process.env.GROQ_API_KEY;
  if(!apiKey) {
    console.error(`${c.red}Error: GROQ_API_KEY not set in .env${c.reset}`);
    process.exit(1);
  }

  const client = new OpenAI({ apiKey, baseURL:"https://api.groq.com/openai/v1" });
  printBanner();

  const rl = readline.createInterface({
    input: process.stdin, output: process.stdout,
    prompt: `${c.yellow}${c.bold}You › ${c.reset}`,
  });

  rl.prompt();
  rl.on("line", async(input) => {
    const line = input.trim();
    if(!line) { rl.prompt(); return; }
    if(["exit","quit"].includes(line.toLowerCase())) {
      console.log(`\n${c.dim}Bye! 👋${c.reset}\n`); process.exit(0);
    }
    try { await runAgent(client, line); }
    catch(err) { console.error(`\n${c.red}[ERROR] ${err.message}${c.reset}`); }
    console.log(""); rl.prompt();
  });
  rl.on("close", () => process.exit(0));
}

main();