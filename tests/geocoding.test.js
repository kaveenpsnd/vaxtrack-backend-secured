import { jest } from '@jest/globals';

// ── Mock axios ──
const mockAxiosGet = jest.fn();
jest.unstable_mockModule('axios', () => ({
    default: { get: mockAxiosGet },
}));

// Mock environment variable
process.env.LOCATIONIQ_API_KEY = 'pk.test_key_12345';

// Import AFTER mocking
const { geocodeAddress, reverseGeocode } = await import('../src/services/geocodingService.js');

// ────────────────────────────────────────────────────────
// ██  GEOCODING SERVICE TESTS
// ────────────────────────────────────────────────────────

describe('Geocoding Service', () => {
    afterEach(() => jest.clearAllMocks());

    // ===================================================
    // geocodeAddress (Forward Geocoding)
    // ===================================================
    describe('geocodeAddress', () => {
        test('should return lat/long for a valid address', async () => {
            mockAxiosGet.mockResolvedValue({
                data: [
                    {
                        lat: '6.9271',
                        lon: '79.8612',
                        display_name: 'Colombo General Hospital, Colombo, Sri Lanka',
                    },
                ],
            });

            const result = await geocodeAddress('Colombo General Hospital', 'Colombo');

            expect(result).toEqual({
                latitude: 6.9271,
                longitude: 79.8612,
                displayName: 'Colombo General Hospital, Colombo, Sri Lanka',
            });

            // Verify API was called with correct params
            expect(mockAxiosGet).toHaveBeenCalledWith(
                expect.stringContaining('/search'),
                expect.objectContaining({
                    params: expect.objectContaining({
                        q: 'Colombo General Hospital, Colombo, Sri Lanka',
                        countrycodes: 'lk',
                        limit: 1,
                    }),
                })
            );
        });

        test('should build query with only address when city is empty', async () => {
            mockAxiosGet.mockResolvedValue({
                data: [{ lat: '7.0', lon: '80.0', display_name: 'Some place' }],
            });

            await geocodeAddress('Main Street');

            expect(mockAxiosGet).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    params: expect.objectContaining({
                        q: 'Main Street, Sri Lanka',
                    }),
                })
            );
        });

        test('should throw error when no results found', async () => {
            mockAxiosGet.mockResolvedValue({ data: [] });

            await expect(geocodeAddress('Nonexistent Place')).rejects.toThrow(
                'No geocoding results found'
            );
        });

        test('should throw error when response data is null', async () => {
            mockAxiosGet.mockResolvedValue({ data: null });

            await expect(geocodeAddress('Nowhere')).rejects.toThrow(
                'No geocoding results found'
            );
        });

        test('should throw error for 401 Unauthorized (invalid API key)', async () => {
            mockAxiosGet.mockRejectedValue({
                response: { status: 401, data: { error: 'Invalid key' } },
            });

            await expect(geocodeAddress('Test Address')).rejects.toThrow(
                'Invalid LocationIQ API key'
            );
        });

        test('should throw error for 429 Rate Limit', async () => {
            mockAxiosGet.mockRejectedValue({
                response: { status: 429, data: { error: 'Rate limit exceeded' } },
            });

            await expect(geocodeAddress('Test Address')).rejects.toThrow(
                'rate limit exceeded'
            );
        });

        test('should throw error for other API errors', async () => {
            mockAxiosGet.mockRejectedValue({
                response: { status: 500, data: { error: 'Internal server error' } },
            });

            await expect(geocodeAddress('Test Address')).rejects.toThrow(
                'LocationIQ API error'
            );
        });

        test('should re-throw non-API errors (e.g., network errors)', async () => {
            mockAxiosGet.mockRejectedValue(new Error('Network Error'));

            await expect(geocodeAddress('Test Address')).rejects.toThrow('Network Error');
        });

        test('should parse lat/lon as floats', async () => {
            mockAxiosGet.mockResolvedValue({
                data: [{ lat: '7.259767', lon: '80.584977', display_name: 'Kandy' }],
            });

            const result = await geocodeAddress('Kandy Hospital');

            expect(typeof result.latitude).toBe('number');
            expect(typeof result.longitude).toBe('number');
            expect(result.latitude).toBeCloseTo(7.259767);
            expect(result.longitude).toBeCloseTo(80.584977);
        });
    });

    // ===================================================
    // reverseGeocode (Reverse Geocoding)
    // ===================================================
    describe('reverseGeocode', () => {
        test('should return address for valid coordinates', async () => {
            mockAxiosGet.mockResolvedValue({
                data: { display_name: 'Colombo, Western Province, Sri Lanka' },
            });

            const result = await reverseGeocode(6.9271, 79.8612);

            expect(result).toBe('Colombo, Western Province, Sri Lanka');
            expect(mockAxiosGet).toHaveBeenCalledWith(
                expect.stringContaining('/reverse'),
                expect.objectContaining({
                    params: expect.objectContaining({
                        lat: 6.9271,
                        lon: 79.8612,
                    }),
                })
            );
        });

        test('should return fallback when display_name is missing', async () => {
            mockAxiosGet.mockResolvedValue({
                data: { display_name: '' },
            });

            const result = await reverseGeocode(6.9, 79.8);

            expect(result).toBe('Address not found');
        });

        test('should throw error for 401 Unauthorized', async () => {
            mockAxiosGet.mockRejectedValue({
                response: { status: 401, data: { error: 'Invalid key' } },
            });

            await expect(reverseGeocode(6.9, 79.8)).rejects.toThrow(
                'Invalid LocationIQ API key'
            );
        });

        test('should throw error for 429 Rate Limit', async () => {
            mockAxiosGet.mockRejectedValue({
                response: { status: 429, data: { error: 'Rate limit' } },
            });

            await expect(reverseGeocode(6.9, 79.8)).rejects.toThrow(
                'rate limit exceeded'
            );
        });

        test('should re-throw non-API errors', async () => {
            mockAxiosGet.mockRejectedValue(new Error('Connection refused'));

            await expect(reverseGeocode(6.9, 79.8)).rejects.toThrow('Connection refused');
        });
    });
});
