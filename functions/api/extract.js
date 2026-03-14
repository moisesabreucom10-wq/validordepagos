export async function onRequestPost({ request, env }) {
    try {
        const { imageBase64 } = await request.json();
        const GEMINI_API_KEY = env.GEMINI_API_KEY;

        if (!GEMINI_API_KEY) {
            return new Response(JSON.stringify({ error: "GEMINI_API_KEY secret is not configured in Cloudflare" }), {
                status: 500,
                headers: { "Content-Type": "application/json" }
            });
        }

        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
        
        // We'll use the raw fetch to Gemini API because @google/genai might have Node dependencies not present in Workers
        const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

        const promptText = `
        You are a highly precise automated bank receipt extraction system.
        Extract transaction data from the provided image and output ONLY a JSON object:
        { "referencia": string, "importe": string, "fechaPago": string (YYYY-MM-DD), "cedulaPagador": string, "telefonoPagador": string, "telefonoDestino": string, "bancoOrigen": string (4-digit code) }
        `;

        const geminiRequest = {
            contents: [{
                parts: [
                    { text: promptText },
                    { inlineData: { mimeType: "image/jpeg", data: base64Data } }
                ]
            }],
            generationConfig: {
                responseMimeType: "application/json"
            }
        };

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiRequest)
        });

        const data = await response.json();
        
        // Extract the JSON string from Gemini's structure
        if (data.candidates && data.candidates[0].content && data.candidates[0].content.parts[0].text) {
             return new Response(data.candidates[0].content.parts[0].text, {
                headers: { "Content-Type": "application/json" }
             });
        }

        return new Response(JSON.stringify({ error: "Failed to parse Gemini response" }), { status: 500 });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}
