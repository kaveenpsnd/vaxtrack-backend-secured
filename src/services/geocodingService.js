import axios from 'axios';

/**
 * Geocoding Service using LocationIQ API
 * Converts addresses to geographic coordinates (latitude, longitude)
 */

const LOCATIONIQ_API_KEY = process.env.LOCATIONIQ_API_KEY;
const LOCATIONIQ_BASE_URL = 'https://us1.locationiq.com/v1';

/**
 * Geocode an address to get latitude and longitude
 * @param {string} address - Full address to geocode
 * @param {string} city - City name (optional, helps improve accuracy)
 * @param {string} country - Country name (default: Sri Lanka)
 * @returns {Promise<{latitude: number, longitude: number}>}
 */
export const geocodeAddress = async (address, city = '', country = 'Sri Lanka') => {
    try {
        // Check if API key is configured
        if (!LOCATIONIQ_API_KEY) {
            throw new Error('LocationIQ API key is not configured in environment variables');
        }

        // Build the query string (combine address, city, country)
        const query = [address, city, country].filter(Boolean).join(', ');

        // Make request to LocationIQ Forward Geocoding API
        const response = await axios.get(`${LOCATIONIQ_BASE_URL}/search`, {
            params: {
                key: LOCATIONIQ_API_KEY,
                q: query,
                format: 'json',
                limit: 1, // Only return the best match
                countrycodes: 'lk', // Restrict to Sri Lanka
            },
        });

        // Check if we got results
        if (!response.data || response.data.length === 0) {
            throw new Error(`No geocoding results found for address: ${query}`);
        }

        const result = response.data[0];

        return {
            latitude: parseFloat(result.lat),
            longitude: parseFloat(result.lon),
            displayName: result.display_name, // Full formatted address from LocationIQ
        };
    } catch (error) {
        // Handle specific LocationIQ API errors
        if (error.response) {
            const status = error.response.status;
            const message = error.response.data?.error || error.message;

            if (status === 401) {
                throw new Error('Invalid LocationIQ API key');
            } else if (status === 429) {
                throw new Error('LocationIQ API rate limit exceeded. Please try again later.');
            } else {
                throw new Error(`LocationIQ API error: ${message}`);
            }
        }

        // Re-throw other errors
        throw error;
    }
};

/**
 * Reverse geocode coordinates to get an address
 * @param {number} latitude - Latitude coordinate
 * @param {number} longitude - Longitude coordinate
 * @returns {Promise<string>} - Formatted address
 */
export const reverseGeocode = async (latitude, longitude) => {
    try {
        if (!LOCATIONIQ_API_KEY) {
            throw new Error('LocationIQ API key is not configured in environment variables');
        }

        const response = await axios.get(`${LOCATIONIQ_BASE_URL}/reverse`, {
            params: {
                key: LOCATIONIQ_API_KEY,
                lat: latitude,
                lon: longitude,
                format: 'json',
            },
        });

        return response.data.display_name || 'Address not found';
    } catch (error) {
        if (error.response) {
            const status = error.response.status;
            const message = error.response.data?.error || error.message;

            if (status === 401) {
                throw new Error('Invalid LocationIQ API key');
            } else if (status === 429) {
                throw new Error('LocationIQ API rate limit exceeded. Please try again later.');
            } else {
                throw new Error(`LocationIQ API error: ${message}`);
            }
        }

        throw error;
    }
};

export default {
    geocodeAddress,
    reverseGeocode,
};
