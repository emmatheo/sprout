import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import vaultRoutes from './routes/vaults.js';
import roundupRoutes from './routes/roundups.js';
import sponsorRoutes from './routes/sponsor.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/vaults', vaultRoutes);
app.use('/api/roundups', roundupRoutes);
app.use('/api/sponsor', sponsorRoutes);

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
    console.log(`Sprout backend listening on port ${PORT}`);
});
