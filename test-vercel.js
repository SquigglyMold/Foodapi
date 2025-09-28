#!/usr/bin/env node

/**
 * Simple test script to validate Vercel configuration
 * Run with: node test-vercel.js
 */

const fs = require('fs');
const path = require('path');

console.log('🧪 Testing Vercel Configuration...\n');

// Test 1: Check if vercel.json exists and is valid
console.log('1. Checking vercel.json...');
try {
  const vercelConfig = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  
  const requiredFields = ['version', 'builds', 'routes'];
  const missingFields = requiredFields.filter(field => !vercelConfig[field]);
  
  if (missingFields.length === 0) {
    console.log('   ✅ vercel.json is valid');
  } else {
    console.log('   ❌ vercel.json is missing:', missingFields.join(', '));
  }
} catch (error) {
  console.log('   ❌ vercel.json is invalid or missing:', error.message);
}

// Test 2: Check if api/index.ts exists
console.log('2. Checking Vercel serverless function...');
if (fs.existsSync('api/index.ts')) {
  console.log('   ✅ api/index.ts exists');
} else {
  console.log('   ❌ api/index.ts is missing');
}

// Test 3: Check if @vercel/node is in dependencies
console.log('3. Checking Vercel dependency...');
try {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  
  if (packageJson.dependencies && packageJson.dependencies['@vercel/node']) {
    console.log('   ✅ @vercel/node dependency found');
  } else {
    console.log('   ❌ @vercel/node dependency missing');
  }
} catch (error) {
  console.log('   ❌ Could not read package.json:', error.message);
}

// Test 4: Check environment variables example
console.log('4. Checking environment variables example...');
if (fs.existsSync('vercel.env.example')) {
  console.log('   ✅ vercel.env.example exists');
} else {
  console.log('   ❌ vercel.env.example is missing');
}

// Test 5: Check .vercelignore
console.log('5. Checking .vercelignore...');
if (fs.existsSync('.vercelignore')) {
  console.log('   ✅ .vercelignore exists');
} else {
  console.log('   ❌ .vercelignore is missing');
}

// Test 6: Check if source files exist
console.log('6. Checking source files...');
const requiredSourceFiles = [
  'src/controllers/foodController.ts',
  'src/services/usdaService.ts',
  'src/routes/foodRoutes.ts',
  'src/middleware/errorHandler.ts',
  'src/types/index.ts'
];

let allSourceFilesExist = true;
requiredSourceFiles.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`   ✅ ${file}`);
  } else {
    console.log(`   ❌ ${file} is missing`);
    allSourceFilesExist = false;
  }
});

console.log('\n🎉 Vercel Configuration Test Complete!');
console.log('\n📋 Next Steps:');
console.log('1. Set environment variables in Vercel dashboard:');
console.log('   - USDA_API_KEY (required)');
console.log('   - NODE_ENV=production');
console.log('   - ALLOWED_ORIGINS (optional)');
console.log('\n2. Deploy with Vercel CLI:');
console.log('   npm i -g vercel');
console.log('   vercel login');
console.log('   vercel');
console.log('\n3. Or deploy via Vercel dashboard:');
console.log('   - Connect your GitHub repository');
console.log('   - Configure environment variables');
console.log('   - Deploy!');
console.log('\n📚 See VERCEL_DEPLOYMENT.md for detailed instructions.');
