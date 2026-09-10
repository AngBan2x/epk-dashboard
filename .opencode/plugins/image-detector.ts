import type { Plugin } from "@opencode-ai/plugin"
import fs from "fs/promises"
import path from "path"

const IMAGE_DIR = "/tmp/opencode-images"
const PROCESSED_IMAGES = new Set<string>()

function isImage(output: any): boolean {
  if (output.type === "image") return true
  if (output.mimeType?.startsWith("image/")) return true
  if (output.url?.match(/\.(png|jpg|jpeg|gif|webp|bmp)(\?.*)?$/i)) return true
  
  const part = output.part || output
  if (part.type === "image") return true
  if (part.mimeType?.startsWith("image/")) return true
  if (part.image || part.base64) return true
  
  return false
}

function getSessionID(output: any, input: any): string {
  return output.sessionID 
    || output.message?.sessionID 
    || output.message?.id
    || input.sessionID
    || input.message?.sessionID
    || "unknown"
}

function getImageHash(output: any): string {
  const part = output.part || output
  return part.base64?.slice(0, 50) || part.image?.slice(0, 50) || part.url || part.filePath || JSON.stringify(output).slice(0, 100)
}

export const ImageDetector: Plugin = async ({ client }) => {
  await fs.mkdir(IMAGE_DIR, { recursive: true })
  console.log("[image-detector] ✅ PLUGIN CARGADO - análisis 100% automático (multi-imagen)")

  const handleImage = async (output: any, sessionID: string) => {
    console.log("[image-detector] handleImage llamado", { sessionID, hasOutput: !!output })
    
    if (!isImage(output)) {
      console.log("[image-detector] No es imagen según isImage()")
      console.log("[image-detector] output keys:", Object.keys(output || {}))
      console.log("[image-detector] output.type:", output?.type)
      console.log("[image-detector] output.mimeType:", output?.mimeType)
      console.log("[image-detector] output.part:", output?.part ? Object.keys(output.part) : "none")
      return
    }
    
    const hash = getImageHash(output)
    if (PROCESSED_IMAGES.has(hash)) {
      console.log("[image-detector] Imagen ya procesada (deduplicado)")
      return
    }
    PROCESSED_IMAGES.add(hash)
    
    console.log("[image-detector] ¡IMAGEN DETECTADA - iniciando análisis automático...")
    
    const timestamp = Date.now()
    const imagePath = path.join(IMAGE_DIR, `${sessionID}-${timestamp}.png`)
    
    try {
      const part = output.part || output
      if (part.base64 || part.image) {
        const b64 = part.base64 || part.image
        const buffer = Buffer.from(b64, "base64")
        await fs.writeFile(imagePath, buffer)
      } else if (part.url) {
        await Bun.$`curl -sL -o ${imagePath} ${part.url}`
      } else if (part.filePath) {
        await fs.copyFile(part.filePath, imagePath)
      }

      await fs.writeFile(
        path.join(IMAGE_DIR, `${sessionID}-latest.json`),
        JSON.stringify({ sessionID, imagePath, timestamp, detected: true }, null, 2)
      )

      console.log("[image-detector] Invocando visual-tester automáticamente...")
      
      const childSession = await client.session.create({
        body: { title: `Análisis: ${path.basename(imagePath)}`, agent: "visual-tester" }
      })

      const analysisPrompt = `Analiza la imagen en: ${imagePath}

Proporciona análisis completo:
1. Qué muestra la imagen (contexto general)
2. Elementos UI visibles (botones, formularios, tablas, navegación)
3. Datos mostrados (textos, números, estados)
4. Problemas visuales, bugs, o inconsistencias
5. Diferencias si hay múltiples imágenes relacionadas
6. Recomendaciones de mejora`

      const result = await client.session.prompt({
        path: { id: childSession.id },
        body: { parts: [{ type: "text", text: analysisPrompt }] }
      })

      const analysis = result.data?.info?.parts?.[0]?.text || "Sin resultado"
      
      await client.session.prompt({
        path: { id: sessionID },
        body: {
          noReply: true,
          parts: [{
            type: "text",
            text: `## 📸 Análisis automático (${PROCESSED_IMAGES.size} imagen${PROCESSED_IMAGES.size > 1 ? 'es' : ''})

**Archivo:** ${path.basename(imagePath)}
**Timestamp:** ${new Date(timestamp).toLocaleString()}

---

${analysis}

---

*Análisis automático por visual-tester (Nemotron 3 Nano Omni)*`
          }]
        }
      })

      console.log("[image-detector] ✅ Análisis completado e inyectado")

    } catch (e) {
      console.error("[image-detector] Error:", e)
      await client.session.prompt({
        path: { id: sessionID },
        body: { noReply: true, parts: [{ type: "text", text: `[Imagen detectada (${path.basename(imagePath)}). Error en análisis automático. Usa analyze-image.]` }] }
      })
    }
  }

  return {
    "message.part.updated": async (input, output) => {
      console.log("[image-detector] EVENT: part.updated")
      const sessionID = getSessionID(output, input)
      await handleImage(output, sessionID)
    },
    "message.part.added": async (input, output) => {
      console.log("[image-detector] EVENT: part.added")
      const sessionID = getSessionID(output, input)
      await handleImage(output, sessionID)
    },
    "message.updated": async (input, output) => {
      console.log("[image-detector] EVENT: message.updated")
      const parts = output.parts || []
      console.log("[image-detector] message.updated parts count:", parts.length)
      for (const part of parts) {
        if (isImage(part)) {
          const sessionID = getSessionID(output, input)
          await handleImage(part, sessionID)
        }
      }
    }
  }
}
