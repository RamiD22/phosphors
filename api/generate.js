// Image Generation API using Replicate (Flux models)

const MODELS = {
  schnell: 'black-forest-labs/flux-schnell',        // Fast, cheap (~$0.003)
  pro: 'black-forest-labs/flux-1.1-pro',            // Premium quality (~$0.05)
  dev: 'black-forest-labs/flux-dev',                // Development/fine-tuning
};

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { 
    prompt, 
    model = 'schnell',           // schnell | pro | dev
    aspect_ratio = '1:1',        // 1:1, 16:9, 9:16, 4:3, 3:4, etc.
    num_outputs = 1,             // 1-4
    output_format = 'webp',      // webp, jpg, png
    output_quality = 90,         // 1-100
    seed                         // optional: for reproducibility
  } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'prompt is required' });
  }

  const modelId = MODELS[model];
  if (!modelId) {
    return res.status(400).json({ 
      error: `Invalid model. Choose: ${Object.keys(MODELS).join(', ')}` 
    });
  }

  const apiToken = process.env.REPLICATE_API_TOKEN;
  if (!apiToken) {
    return res.status(500).json({ error: 'REPLICATE_API_TOKEN not configured' });
  }

  try {
    // Create prediction
    const input = {
      prompt,
      aspect_ratio,
      num_outputs: Math.min(num_outputs, 4),
      output_format,
      output_quality
    };
    
    if (seed !== undefined) {
      input.seed = seed;
    }

    // Use the models endpoint for official models
    const createResponse = await fetch(`https://api.replicate.com/v1/models/${modelId}/predictions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
        'Prefer': 'wait'  // Wait for result (up to 60s)
      },
      body: JSON.stringify({ input })
    });

    if (!createResponse.ok) {
      const err = await createResponse.text();
      console.error('Replicate create error:', err);
      return res.status(500).json({ error: 'Failed to create prediction', details: err });
    }

    let prediction = await createResponse.json();
    
    // Poll for completion (max 60 seconds)
    const startTime = Date.now();
    const timeout = 60000;
    
    while (prediction.status !== 'succeeded' && prediction.status !== 'failed') {
      if (Date.now() - startTime > timeout) {
        return res.status(408).json({ error: 'Generation timeout', prediction_id: prediction.id });
      }
      
      await new Promise(r => setTimeout(r, 1000));
      
      const pollResponse = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
        headers: { 'Authorization': `Bearer ${apiToken}` }
      });
      prediction = await pollResponse.json();
    }

    if (prediction.status === 'failed') {
      return res.status(500).json({ error: 'Generation failed', details: prediction.error });
    }

    // Return the generated image(s)
    const images = Array.isArray(prediction.output) ? prediction.output : [prediction.output];
    
    return res.status(200).json({
      success: true,
      images,
      model,
      prompt,
      prediction_id: prediction.id,
      metrics: prediction.metrics
    });

  } catch (error) {
    console.error('Generate error:', error);
    return res.status(500).json({ error: 'Generation failed', details: error.message });
  }
}
