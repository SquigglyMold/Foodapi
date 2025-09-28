# Vercel Deployment Guide

This guide explains how to deploy the Food API to Vercel as a serverless function.

## Prerequisites

1. A Vercel account (free tier available)
2. Node.js 18+ installed locally
3. Vercel CLI installed: `npm i -g vercel`

## Environment Variables

Before deploying, you need to set up the following environment variables in your Vercel dashboard:

### Required Variables

- `USDA_API_KEY` - Your USDA Food Data Central API key

### Optional Variables

- `NODE_ENV` - Set to `production` for production deployment
- `ALLOWED_ORIGINS` - Comma-separated list of allowed CORS origins
- `RATE_LIMIT_WINDOW_MS` - Rate limiting window in milliseconds (default: 900000)
- `RATE_LIMIT_MAX_REQUESTS` - Maximum requests per window (default: 100)

## Deployment Steps

### Method 1: Using Vercel CLI

1. **Install Vercel CLI** (if not already installed):
   ```bash
   npm i -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

3. **Deploy from your project directory**:
   ```bash
   vercel
   ```

4. **Follow the prompts**:
   - Link to existing project or create new one
   - Set up environment variables when prompted

### Method 2: Using Vercel Dashboard

1. **Push your code to GitHub/GitLab/Bitbucket**

2. **Go to [vercel.com](https://vercel.com) and sign in**

3. **Click "New Project"**

4. **Import your repository**

5. **Configure the project**:
   - Framework Preset: Other
   - Build Command: `npm run vercel-build`
   - Output Directory: Leave empty
   - Install Command: `npm install`

6. **Set environment variables** in the dashboard

7. **Deploy**

## Project Structure for Vercel

```
├── api/
│   └── index.ts          # Vercel serverless function
├── src/
│   ├── controllers/      # API controllers
│   ├── middleware/       # Express middleware
│   ├── routes/          # API routes
│   ├── services/        # Business logic
│   ├── types/           # TypeScript types
│   └── utils/           # Utility functions
├── vercel.json          # Vercel configuration
├── .vercelignore        # Files to ignore in deployment
└── package.json         # Dependencies and scripts
```

## API Endpoints

Once deployed, your API will be available at:

- **Base URL**: `https://your-project.vercel.app`
- **Health Check**: `GET /health`
- **Search Foods**: `GET /api/foods?type=apple&pageSize=5`
- **Food Details**: `GET /api/foods/:fdcId`
- **Nutrition Data**: `GET /api/foods/:fdcId/nutrition`

## Configuration Details

### vercel.json

The `vercel.json` file configures:
- **Build settings**: Uses `@vercel/node` for TypeScript support
- **Routing**: Maps all requests to the serverless function
- **Environment**: Sets `NODE_ENV=production`
- **Function timeout**: 30 seconds maximum

### Rate Limiting

The API includes built-in rate limiting:
- **General API**: 100 requests per 15 minutes
- **Search endpoints**: 10 requests per minute
- **Health check**: 60 requests per minute

### Security Features

- **Helmet**: Security headers
- **CORS**: Configurable cross-origin requests
- **Input validation**: Comprehensive parameter validation
- **Error handling**: Structured error responses

## Monitoring and Logs

### Vercel Dashboard

- View function invocations and performance
- Monitor error rates and response times
- Access real-time logs

### Health Check Endpoint

Monitor your API health:
```bash
curl https://your-project.vercel.app/health
```

Response includes:
- API status
- USDA API connectivity
- System information
- Rate limit status

## Troubleshooting

### Common Issues

1. **Function timeout**: Increase `maxDuration` in `vercel.json`
2. **Memory issues**: Optimize code or increase memory limit
3. **Cold starts**: Use Vercel Pro for better performance
4. **Environment variables**: Ensure all required vars are set

### Debugging

1. **Check Vercel function logs** in the dashboard
2. **Test locally** with `vercel dev`
3. **Validate environment variables** are properly set
4. **Test individual endpoints** to isolate issues

## Performance Optimization

### For Production

1. **Enable caching** where appropriate
2. **Optimize database queries** (if using a database)
3. **Use CDN** for static assets
4. **Monitor performance** in Vercel dashboard

### Cold Start Optimization

1. **Minimize dependencies**
2. **Use connection pooling**
3. **Pre-warm functions** if needed
4. **Consider Vercel Pro** for better performance

## Cost Considerations

### Free Tier Limits

- **100GB bandwidth** per month
- **1000 function invocations** per day
- **10-second timeout** per function

### Pro Tier Benefits

- **Unlimited bandwidth**
- **100,000 function invocations** per day
- **60-second timeout** per function
- **Better performance**

## Support

For issues with:
- **Vercel deployment**: Check [Vercel documentation](https://vercel.com/docs)
- **API functionality**: Review server logs and error responses
- **Performance**: Monitor Vercel dashboard metrics
