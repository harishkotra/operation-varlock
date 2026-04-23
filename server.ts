import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { load } from 'varlock';
import { redactSensitiveConfig } from 'varlock/env';
import dotenv from 'dotenv';

// Load secrets for the human/server side
dotenv.config();

// Initialize Varlock Vibe: Load the graph and prepare the runtime shield
// This satisfies "Schemas for agents, Secrets for humans"
try {
  await load();
} catch (e) {
  console.warn('Varlock load failed - environment might not be managed by varlock runner. Falling back to manual redaction.');
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const varlock = {
  redact: (text: string, options?: { sensitiveValues?: string[] }) => {
    // If we have specific values to redact, we use Varlock's core redaction logic
    // but we can also rely on the global redactSensitiveConfig which uses the graph
    let result = redactSensitiveConfig(text);
    
    // If the graph didn't pick it up (e.g. not run via varlock run), 
    // we manually redact the passed sensitive values to maintain the "Varlock Shield"
    if (options?.sensitiveValues) {
      options.sensitiveValues.forEach(val => {
        if (val) result = result.split(val).join('[REDACTED]');
      });
    }
    return result;
  }
};

// SECRETS (Varlock will help protect these)
const SECRETS = {
  BITCOIN_VAULT_KEY: process.env.BITCOIN_VAULT_KEY || "vx-99-beta-7",
  CEO_NICKNAME: process.env.CEO_NICKNAME || "pookie-bear-69",
};

// VARLOCK SCHEMA (The AI-Safe part)
// We provide context to the AI without providing values
const VARLOCK_AI_SAFE_SCHEMA = {
  BITCOIN_VAULT_KEY: {
    sensitive: true,
    type: "string(length=12)",
    description: "The master code to the offshore Bitcoin vault"
  },
  CEO_NICKNAME: {
    sensitive: true,
    type: "string",
    description: "The CEO's private, embarrassing nickname"
  },
  SECURITY_LEVEL: {
    sensitive: false,
    type: "enum(low, guarded, high, terminal)",
    description: "Current security alert level of the corporation"
  },
  COMPANY_WIKI: {
    sensitive: false,
    type: "url",
    description: "Internal employee handbook URL"
  }
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // API Routes
  app.get('/api/schema', (req, res) => {
    // Return the safe schema to the frontend
    res.json(VARLOCK_AI_SAFE_SCHEMA);
  });

  app.post('/api/verify', (req, res) => {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "No text provided" });

    // THE VARLOCK SHIELD: Runtime redaction
    // Using Varlock's core philosophy of catching leaks before they reach the human terminal
    let redacted = text;
    let leaksDetected = [];

    // Official Varlock redaction logic (automated check against sensitive keys)
    // Here we simulate the runtime catch if the AI spills the bits
    if (text.includes(SECRETS.BITCOIN_VAULT_KEY)) {
      redacted = varlock.redact(redacted, { sensitiveValues: [SECRETS.BITCOIN_VAULT_KEY] });
      leaksDetected.push("BITCOIN_VAULT_KEY");
    }
    if (text.includes(SECRETS.CEO_NICKNAME)) {
      redacted = varlock.redact(redacted, { sensitiveValues: [SECRETS.CEO_NICKNAME] });
      leaksDetected.push("CEO_NICKNAME");
    }

    res.json({
      original: text,
      redacted,
      isBreached: leaksDetected.length > 0,
      leakedSecrets: leaksDetected,
      revealedValues: leaksDetected.reduce((acc, key) => ({ 
        ...acc, 
        [key]: process.env[key] 
      }), {})
    });
  });

  // Vite integration
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`TERMINAL_HEIST Server with real Varlock logic running on http://localhost:${PORT}`);
  });
}

startServer();
