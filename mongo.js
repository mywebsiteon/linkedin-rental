const mongoose = require('mongoose');

const MONGO_CONNECT_OPTIONS = {
  serverSelectionTimeoutMS: 5000
};

function isSrvLookupFailure(error) {
  if (!error) return false;

  const parts = [
    error.code,
    error.syscall,
    error.hostname,
    error.message
  ].filter(Boolean);

  const details = parts.join(' ');
  return details.includes('querySrv') || details.includes('_mongodb._tcp.');
}

async function connectToMongo() {
  const primaryUri = process.env.MONGODB_URI;
  const directUri = process.env.MONGODB_DIRECT_URI;

  if (!primaryUri && !directUri) {
    throw new Error('Neither MONGODB_URI nor MONGODB_DIRECT_URI is set. Add one to your .env file.');
  }

  if (primaryUri) {
    try {
      await mongoose.connect(primaryUri, MONGO_CONNECT_OPTIONS);
      return { uriType: 'srv' };
    } catch (error) {
      if (!directUri || !isSrvLookupFailure(error)) {
        throw error;
      }

      console.warn('SRV MongoDB URI failed to resolve. Retrying with direct Atlas hosts...');
      await mongoose.disconnect().catch(() => {});
    }
  }

  await mongoose.connect(directUri, MONGO_CONNECT_OPTIONS);
  return { uriType: 'direct' };
}

module.exports = {
  connectToMongo
};
