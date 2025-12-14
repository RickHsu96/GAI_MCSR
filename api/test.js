// Vercel Serverless Function - Test Environment Variables
// GET /api/test

export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");

    const geminiKey = process.env.GEMINI_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    // Check what environment variables are available
    const envVars = Object.keys(process.env).filter(key =>
        key.includes('GEMINI') ||
        key.includes('OPENAI') ||
        key.includes('API')
    );

    res.status(200).json({
        message: "Environment Variable Test",
        geminiKeySet: !!geminiKey,
        geminiKeyPreview: geminiKey ? `${geminiKey.substring(0, 8)}...` : "NOT SET",
        openaiKeySet: !!openaiKey,
        relevantEnvVars: envVars,
        nodeEnv: process.env.NODE_ENV,
        vercelEnv: process.env.VERCEL_ENV,
    });
}
