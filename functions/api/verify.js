export async function onRequestPost({ request, env }) {
    try {
        const body = await request.json();
        const API_URL = 'https://bdvconciliacion.banvenez.com:443/getMovement';
        const API_KEY = env.BDV_API_KEY;

        if (!API_KEY) {
            return new Response(JSON.stringify({ error: "BDV_API_KEY secret is not configured in Cloudflare" }), {
                status: 500,
                headers: { "Content-Type": "application/json" }
            });
        }

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'X-API-Key': API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        const data = await response.json();
        return new Response(JSON.stringify(data), {
            headers: { "Content-Type": "application/json" }
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}
