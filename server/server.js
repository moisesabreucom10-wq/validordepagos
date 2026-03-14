const express = require('express');
const cors = require('cors');
const axios = require('axios');
const https = require('https');
require('dotenv').config();

const app = express();
const PORT = 3000;

// Enable CORS for localhost connections
app.use(cors());
// Parse JSON bodies
app.use(express.json());

// BDV API Configuration
const API_URL = 'https://bdvconciliacion.banvenez.com:443/getMovement';
const API_KEY = process.env.BDV_API_KEY; 

// Optional: If the bank's certificate is self-signed or has issues, we might need a custom HTTPS agent.
const httpsAgent = new https.Agent({  
    rejectUnauthorized: false // WARNING: Use 'false' only for testing if the bank cert is invalid.
});

app.post('/api/verify', async (req, res) => {
    console.log('Received request from frontend:', req.body);
    
    try {
        const response = await axios.post(API_URL, req.body, {
            headers: {
                'X-API-Key': API_KEY,
                'Content-Type': 'application/json'
            },
            httpsAgent: httpsAgent,
            timeout: 10000 // 10 second timeout
        });

        console.log('Bank API Response:', response.data);
        res.json(response.data);
    } catch (error) {
        console.error('Error connecting to Bank API:', error.message);
        
        // Detailed error logging
        if (error.response) {
            console.error('Data:', error.response.data);
            console.error('Status:', error.response.status);
            
            // Forward the bank's error response back to the frontend
            return res.status(error.response.status).json(error.response.data);
        } else if (error.request) {
            console.error('No response received from Bank API');
            return res.status(503).json({ 
                code: 503, 
                message: "No response from Bank API. The server might be unreachable.",
                error: error.message
            });
        }
        
        res.status(500).json({ 
            code: 500, 
            message: "Internal server error while processing the request",
            error: error.message
        });
    }
});

// Advanced OCR using Gemini 2.5 Flash
const { GoogleGenAI, Type, Schema } = require('@google/genai');

app.post('/api/extract', async (req, res) => {
    console.log('Received extraction request');
    try {
        const { imageBase64 } = req.body;
        if (!imageBase64) {
             return res.status(400).json({ error: "Missing imageBase64 in request body" });
        }
        
        // Ensure GEMINI_API_KEY is available in environment
        if (!process.env.GEMINI_API_KEY) {
            console.error("CRITICAL: GEMINI_API_KEY environment variable is missing.");
             return res.status(500).json({ error: "Server is missing Gemini API Key configuration." });
        }

        const ai = new GoogleGenAI({}); 

        // Strip the data:image/png;base64, prefix if present
        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");

        const promptText = `
        You are a highly precise automated bank receipt extraction system.
        I will provide an image of a Venezuelan bank transfer receipt (pago móvil or transfer).
        Your job is to find the required data and output it ONLY as a valid JSON object matching the exact schema provided.
        
        CRITICAL INSTRUCTIONS FOR EXTRACTION:
        1. "referencia": Extract the transaction reference number (typically 6-15 digits long).
        2. "importe": Extract the total amount transferred. FORMAT IT STRICTLY as a string containing only numbers and a decimal point if necessary (e.g. "1250.00", "50", "450.50"). REMOVE ALL currency symbols, spaces, or thousands separators (commas).
        3. "fechaPago": Extract the date of the transaction. FORMAT IT STRICTLY as "YYYY-MM-DD". You must convert from formats like DD/MM/YYYY or strings.
        4. "cedulaPagador": Extract the ID/CEDULA of the person who made the payment. Try to include the preceding 'V' or 'E' or 'J' if present (e.g. "V27037606").
        5. "telefonoPagador": Extract the phone number of the person who MADE the payment (the sender/origin account). Format as a continuous string of numbers (e.g. "04141234567").
        6. "telefonoDestino": Extract the phone number of the person/business who RECEIVED the payment (the destination account). Format as a continuous string of numbers.
        7. "bancoOrigen": Identifiy the NAME of the bank from which the money was sent (the payer's bank). YOU MUST MAP THIS NAME TO THE OFFICIAL 4-DIGIT CODE. Examples: "0102" (Banco de Venezuela), "0134" (Banesco), "0105" (Mercantil), "0108" (Provincial), "0114" (Bancaribe), "0115" (Exterior), "0128" (Caroni), "0138" (Plaza), "0151" (BFC), "0156" (100% Banco), "0172" (Bancamiga), "0171" (Activo), "0174" (Banplus), "0175" (Bicentenario), "0177" (Banfanb), "0191" (BNC). If you cannot determine the bank, output "".
        
        If a field is absolutely not visible in the image, output an empty string "". Use your best deduction based on context if labels are ambiguous.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [
                promptText,
                {
                    inlineData: {
                        mimeType: 'image/jpeg', // Gemini accepts jpeg/png broadly here
                        data: base64Data
                    }
                }
            ],
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        referencia: { type: Type.STRING },
                        importe: { type: Type.STRING },
                        fechaPago: { type: Type.STRING },
                        cedulaPagador: { type: Type.STRING },
                        telefonoPagador: { type: Type.STRING },
                        telefonoDestino: { type: Type.STRING },
                        bancoOrigen: { type: Type.STRING },
                    },
                    required: ["referencia", "importe", "fechaPago", "bancoOrigen"]
                }
            }
        });

        const extractedData = JSON.parse(response.text);
        console.log('Gemini Extraction Success:', extractedData);
        res.json(extractedData);

    } catch (error) {
        console.error('Gemini Extraction Error:', error);
        res.status(500).json({ error: "Failed to extract data via Gemini AI", details: error.message });
    }
});

app.listen(PORT, () => {
    console.log('');
    console.log('==================================================');
    console.log(`🚀 BankVerify API Proxy running at http://localhost:${PORT}`);
    console.log('⚠️ IMPORTANT: Ensure GEMINI_API_KEY is in your environment if using the AI endpoint.');
    console.log('==================================================');
    console.log('');
});
