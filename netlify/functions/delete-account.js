const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const authHeader = event.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    // Verify the token belongs to the user making the request
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token' }) };
    }

    const { user_id } = JSON.parse(event.body || '{}');

    // Ensure the token user matches the requested deletion
    if (user.id !== user_id) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) };
    }

    // Hard delete the auth user using service role
    const { error: deleteError } = await supabase.auth.admin.deleteUser(user_id);
    if (deleteError) {
      return { statusCode: 500, body: JSON.stringify({ error: deleteError.message }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
