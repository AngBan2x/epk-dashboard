import { tool } from "@opencode-ai/plugin"
import fs from "fs/promises"
import path from "path"

const IMAGE_DIR = "/tmp/opencode-images"

export default tool({
  description: "Analiza una imagen usando el subagente vision-capable. Úsala cuando se detecte una imagen en la conversación.",
  args: {
    question: tool.schema.string().describe("Qué quieres saber sobre la imagen")
  },
  async execute(args, context) {
    const { sessionID } = context
    
    const metadataPath = path.join(IMAGE_DIR, `${sessionID}-latest.json`)
    try {
      const raw = await fs.readFile(metadataPath, "utf-8")
      const metadata = JSON.parse(raw)
      
      const result = await context.task({
        subagent_type: "visual-tester",
        prompt: `Analiza la imagen ubicada en: ${metadata.imagePath}

Pregunta del usuario: ${args.question}

Proporciona una descripción detallada incluyendo:
- Qué muestra la imagen
- Elementos principales
- Texto visible (si hay)
- Problemas o bugs visuales (si los hay)
- Recomendaciones (si aplican)`
      })
      
      return result
    } catch (error) {
      return `Error al analizar imagen: ${error}`
    }
  }
})
