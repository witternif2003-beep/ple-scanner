const express = require('express');
const app = express();
app.use(express.json());

// Load your API route
const api = require('./api/index.js');

app.use('/api', async (req, res) => {
  const result = await api(req, res);
  return result;
});

app.listen(3000, () => console.log('Running on port 3000'));
