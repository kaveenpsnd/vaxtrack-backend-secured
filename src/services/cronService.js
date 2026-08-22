import cron from 'node-cron';
import Record from '../models/Record.js';
import User from '../models/User.js';
import { sendNotificationAlert } from './emailService.js';

const checkOverdueVaccinations = async () => {
    try {
        console.log('🔍 Scanning database for overdue vaccinations...');
        
        // Fetch all active records populated with vaccine data and patient info
        const records = await Record.find()
            .populate('vaccineId', 'name dosesRequired daysBetweenDoses')
            .populate('patientId', 'name email');

        // Group records by patientId + dependentName + vaccineId
        const groups = new Map();
        
        for (const r of records) {
            const patientIdStr = r.patientId?._id?.toString();
            // skip if orphan record or missing vaccine data
            if (!patientIdStr || !r.vaccineId) continue;

            const dep = r.dependentName ? r.dependentName.toLowerCase().trim() : 'self';
            const vId = r.vaccineId._id.toString();
            const key = `${patientIdStr}_${dep}_${vId}`;
            
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(r);
        }

        const now = new Date();
        let alertsSent = 0;

        for (const [key, groupRecords] of groups.entries()) {
            // Sort by dateAdministered descending (newest first)
            const sorted = groupRecords.sort((a, b) => new Date(b.dateAdministered) - new Date(a.dateAdministered));
            const latestRecord = sorted[0];
            const vaccine = latestRecord.vaccineId;
            const patient = latestRecord.patientId;
            const doseCount = sorted.length;

            if (!vaccine.dosesRequired || !vaccine.daysBetweenDoses) continue;

            // If they are fully vaccinated for this sequence, gracefully skip
            if (doseCount >= vaccine.dosesRequired) continue;

            // They still need more doses. Calculate when the next dose was legally due:
            const nextDate = new Date(latestRecord.dateAdministered);
            nextDate.setDate(nextDate.getDate() + vaccine.daysBetweenDoses);

            // If the calculated next dose date is in the past, they are OVERDUE.
            // Further, check if we have already sent an email for this specific pending dose.
            if (nextDate < now && !latestRecord.overdueNotified) {
                const dependentNameStr = latestRecord.dependentName || 'yourself';
                
                // Construct and send email
                const emailSubject = `🚨 Overdue Vaccination Alert: ${vaccine.name}`;
                const emailMessage = `This is a critical reminder that the next dose of the <strong>${vaccine.name}</strong> vaccine for <strong>${dependentNameStr}</strong> was physically due on ${nextDate.toLocaleDateString()}. Please immediately book an appointment via the VaxTrack platform to ensure full immunization.`;

                const emailResult = await sendNotificationAlert({
                    patientEmail: patient.email,
                    patientName: patient.name,
                    subject: emailSubject,
                    message: emailMessage
                });

                if (emailResult.success) {
                    // Lock this record so they don't get spammed every time the cron runs
                    latestRecord.overdueNotified = true;
                    await latestRecord.save();
                    alertsSent++;
                }
            }
        }

        console.log(`✅ Overdue scan complete. Sent ${alertsSent} new email alerts.`);
        
    } catch (error) {
        console.error('❌ Error during checkOverdueVaccinations cron job:', error.message);
    }
};

export const startCronJobs = () => {
    // Schedule a scan to run natively every day at 09:00 AM server time
    cron.schedule('0 9 * * *', async () => {
        console.log('⏳ Running scheduled background job: checkOverdueVaccinations');
        await checkOverdueVaccinations();
    });
};
