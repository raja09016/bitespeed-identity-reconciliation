import express from 'express';
import identifyRoutes from './routes/identify';

const app = express();

app.use(express.json());

// Load routes
app.use('/', identifyRoutes);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal Server Error' });
});

export default app;
