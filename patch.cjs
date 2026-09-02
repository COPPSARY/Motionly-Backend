const fs = require('fs');
const file = 'C:/Users/proms/OneDrive/Desktop/Motionly/src/ui/App.svelte';
let content = fs.readFileSync(file, 'utf8');

// 1. Add imports
content = content.replace(
  'import AnimationControls from "./AnimationControls.svelte";',
  'import AnimationControls from "./AnimationControls.svelte";\n  import { generationStore, startNewGeneration, startEditGeneration } from "../stores/generation";'
);

// 2. Handle onMount for prompt param
const mountTarget = 'fitPreview();\n    updateSelectionRect();';
content = content.replace(
  mountTarget,
  mountTarget + '\n\n    const params = new URLSearchParams(window.location.search);\n    const initialPrompt = params.get("prompt");\n    if (initialPrompt) {\n      chatOpen = true;\n      assistantMessages = [...assistantMessages, { role: "user", text: initialPrompt }];\n      startNewGeneration("default-workspace", initialPrompt);\n      window.history.replaceState({}, document.title, "/");\n    }\n'
);

// 3. React to store changes to push messages
content = content.replace(
  'let authChecked = false;',
  'let authChecked = false;\n  let lastGenState = "";\n  $: {\n    if ($generationStore.isActive && $generationStore.message !== lastGenState) {\n      lastGenState = $generationStore.message;\n      assistantMessages = [...assistantMessages, { role: "assistant", text: $generationStore.message }];\n    } else if (!$generationStore.isActive && $generationStore.status === "COMPLETED" && lastGenState !== "COMPLETED") {\n      lastGenState = "COMPLETED";\n      assistantMessages = [...assistantMessages, { role: "assistant", text: "Done — loading the new revision." }];\n    } else if ($generationStore.error && lastGenState !== "ERROR") {\n      lastGenState = "ERROR";\n      assistantMessages = [...assistantMessages, { role: "assistant", text: "Error: " + $generationStore.error }];\n    }\n  }'
);

// 4. Update submitAssistant
const submitTarget = 'function submitAssistant(event: SubmitEvent): void {\n    event.preventDefault();\n    const prompt = assistantDraft.trim();\n    if (!prompt) return;\n    assistantMessages = [\n      ...assistantMessages,\n      { role: "user", text: prompt },\n      {\n        role: "assistant",\n        text: "Request captured. Connect a web AI provider to turn it into source edits; generated changes must target semantic HTML/SVG, CSS, and the caller-owned GSAP timeline.",\n      },\n    ];\n    assistantDraft = "";\n  }';

const newSubmit = 'function submitAssistant(event: SubmitEvent): void {\n    event.preventDefault();\n    const prompt = assistantDraft.trim();\n    if (!prompt) return;\n    assistantMessages = [...assistantMessages, { role: "user", text: prompt }];\n    startEditGeneration("default-project", prompt, "current-version", 1);\n    assistantDraft = "";\n  }';

content = content.replace(submitTarget, newSubmit);

fs.writeFileSync(file, content);
console.log('App.svelte patched');
