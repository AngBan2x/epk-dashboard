Directrices del Proyecto Final

## **Curso de Desarrollo con Inteligencia Artificial**

### **Objetivo del Proyecto**

El proyecto final consiste en la conceptualización, construcción y despliegue de pagina web interactiva. Los estudiantes deberán completar el ciclo completo y publicar su aplicación en la nube mediante plataformas de despliegue directo.  
El enfoque de evaluación recae totalmente en la capacidad de orquestación técnica utilizando herramientas de IA generativa (OpenCode, Agentes, GitHub Copilot) implementadas durante los módulos del curso, y no en la codificación manual de la sintaxis.

### **Normativas Estrictas del proyecto**

Se auditará el cumplimiento ineludible de las siguientes reglas:

> * **1\. Cero Código Manual (Regla Fundamental):** Queda estrictamente prohibida la escritura manual de la lógica de programación. Toda la estructura, funciones e integraciones deben ser generadas mediante estrategias de prompting, delegadas a los Modos Plan/Build y herramientas de autocompletado (BYOK).  
> * **2\. Integración de Contexto de Datos (MCP):** El sistema debe ser dinámico. El estudiante creará un archivo base (JSON o CSV) o trabajará con SQLite, dónde se contenga la información a mostrar, el cual debe ser inyectado como contexto para que el Agente desarrolle la interfaz en función de esos datos estructurales.  
> * **3\. Uso de Skills / Comandos Personalizados:** Es requisito indispensable instalar o crear y hacer uso de al menos una skill y configurar al menos un comando personalizado en el entorno (ej.  
>   `/renderizar_tarjetas`) que orqueste instrucciones complejas para la creación del frontend.  
> * **4\. Uso de Agentes Personalizados:** Es obligatorio integrar al menos un agente especializado diseñado para gestionar una parte específica del proyecto, demostrando capacidad de orquestación y flujo de trabajo entre agentes.  
> * **5\. Refactorización y Depuración Autónoma:** Ante problemas de compatibilidad visual, errores en consola o fallos con variables nulas, la resolución manual está prohibida. El estudiante debe apoyarse en el Agente de terminal o chat para rastrear el fallo, solicitar el porqué del error y aplicar la corrección automática.  
> * **6\. Despliegue a Producción:** El reto culmina exitosamente cuando la web está publicada, siendo accesible de forma pública mediante un enlace funcional.

### **Temáticas Sugeridas (Opcionales)**

El dominio de la aplicación es de elección libre. A continuación, se brindan algunos perfiles de referencia para inspirar el desarrollo:

| Perfil | Descripción del Proyecto |
| :---- | :---- |
| **Corporativo / Analítica: Dashboard de Métricas** | Una interfaz visual que analice un dataset comercial. En lugar de agrupaciones mensuales estáticas, la IA deberá ser instruida para configurar gráficas que representen los movimientos de los últimos 30 días móviles, incorporando filtros interactivos sobre la misma vista. |
| **Sistemas / Salud: Buscador de Historiales** | Un panel de administración que lea una base JSON (ej. perfiles de pacientes). Se puede instruir a la IA para dividir campos agrupados (separando nombre y apellido en distintas columnas) y establecer reglas estrictas en el código frontend para soportar variables nulas en el archivo origen sin que la interfaz web colapse. |
| **Creativo: Pitch Deck Animado** | Un portafolio narrativo (estilo anime adulto) montado como galería web. El reto técnico consiste en instruir al agente para estructurar el CSS empleando relaciones de aspecto ultra-anchas (21:9), enmarcando encuadres dramáticos y fichas de diseño de personajes en un flujo continuo. |

