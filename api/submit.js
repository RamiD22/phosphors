// Vercel Serverless Function - Submit Art
// POST /api/submit

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { moltbook, title, url, description } = req.body;

    // Validate required fields
    if (!moltbook || !title || !url || !description) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const submission = {
      id: Date.now().toString(),
      moltbook,
      title,
      url,
      description,
      status: 'pending',
      submittedAt: new Date().toISOString()
    };

    // TODO: Store in Supabase
    // For now, log and return success
    console.log('New submission:', submission);

    return res.status(200).json({ 
      success: true, 
      message: 'Submission received',
      id: submission.id 
    });
  } catch (error) {
    console.error('Submit error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
