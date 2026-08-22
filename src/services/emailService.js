import nodemailer from 'nodemailer';

// ──────────────────────────────────────────────
// Create the Nodemailer transporter
// Uses SMTP credentials from environment variables.
// Supports Gmail, SendGrid, Mailtrap, or any SMTP provider.
//
// Required env vars:
//   EMAIL_HOST     (e.g. smtp.gmail.com, smtp.sendgrid.net)
//   EMAIL_PORT     (e.g. 587)
//   EMAIL_USER     (your email or 'apikey' for SendGrid)
//   EMAIL_PASS     (your password or API key)
//   EMAIL_FROM     (sender address, e.g. noreply@vaxtrack.lk)
// ──────────────────────────────────────────────
const createTransporter = () => {
    return nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: parseInt(process.env.EMAIL_PORT) || 587,
        secure: process.env.EMAIL_PORT === '465', // true for 465, false for other ports
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });
};

// ──────────────────────────────────────────────
// Send vaccination confirmation email
// Called after a record is created via POST /api/records
// ──────────────────────────────────────────────
const sendVaccinationConfirmation = async ({ patientEmail, patientName, vaccineName, hospitalName, dateAdministered, nextDoseDate, dependentName }) => {
    try {
        const transporter = createTransporter();

        const recipientName = dependentName || patientName;

        const nextDoseInfo = nextDoseDate
            ? `<tr>
           <td style="padding: 10px; border-bottom: 1px solid #e0e0e0; color: #666;">Next Dose Due</td>
           <td style="padding: 10px; border-bottom: 1px solid #e0e0e0; font-weight: bold; color: #e74c3c;">${new Date(nextDoseDate).toLocaleDateString('en-LK', { year: 'numeric', month: 'long', day: 'numeric' })}</td>
         </tr>`
            : '';

        const htmlContent = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8f9fa; border-radius: 12px; overflow: hidden;">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #2563eb, #1e40af); padding: 30px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">💉 VaxTrack</h1>
          <p style="color: #bfdbfe; margin: 8px 0 0;">National Vaccine Management System</p>
        </div>
        
        <!-- Body -->
        <div style="padding: 30px;">
          <h2 style="color: #1e40af; margin-top: 0;">Vaccination Confirmed ✅</h2>
          
          <p style="color: #374151; line-height: 1.6;">
            Dear <strong>${patientName}</strong>,
          </p>
          
          <p style="color: #374151; line-height: 1.6;">
            ${dependentName
                ? `We are pleased to confirm that your dependent <strong>${dependentName}</strong> has been successfully vaccinated.`
                : 'We are pleased to confirm that your vaccination has been successfully recorded.'
            }
          </p>
          
          <!-- Details Table -->
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #e0e0e0; color: #666;">Patient</td>
              <td style="padding: 10px; border-bottom: 1px solid #e0e0e0; font-weight: bold;">${recipientName}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #e0e0e0; color: #666;">Vaccine</td>
              <td style="padding: 10px; border-bottom: 1px solid #e0e0e0; font-weight: bold;">${vaccineName || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #e0e0e0; color: #666;">Hospital</td>
              <td style="padding: 10px; border-bottom: 1px solid #e0e0e0; font-weight: bold;">${hospitalName || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #e0e0e0; color: #666;">Date</td>
              <td style="padding: 10px; border-bottom: 1px solid #e0e0e0; font-weight: bold;">${new Date(dateAdministered).toLocaleDateString('en-LK', { year: 'numeric', month: 'long', day: 'numeric' })}</td>
            </tr>
            ${nextDoseInfo}
          </table>
          
          ${nextDoseDate ? `
          <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; border-radius: 4px; margin: 20px 0;">
            <strong style="color: #92400e;">⏰ Reminder:</strong>
            <span style="color: #92400e;"> Your next dose is scheduled. We will notify you when it's due.</span>
          </div>
          ` : ''}
          
          <p style="color: #6b7280; font-size: 13px; margin-top: 30px;">
            If you experience any side effects, please report them through the VaxTrack app or contact your healthcare provider.
          </p>
        </div>
        
        <!-- Footer -->
        <div style="background: #1e293b; padding: 20px; text-align: center;">
          <p style="color: #94a3b8; margin: 0; font-size: 12px;">
            This is an automated message from VaxTrack. Do not reply to this email.
          </p>
        </div>
      </div>
    `;

        const mailOptions = {
            from: `"VaxTrack" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
            to: patientEmail,
            subject: `Vaccination Confirmed — ${vaccineName || 'Vaccine'} for ${recipientName}`,
            html: htmlContent,
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`✅ Vaccination confirmation email sent to ${patientEmail} (Message ID: ${info.messageId})`);
        return { success: true, messageId: info.messageId };

    } catch (error) {
        // Email failure should NOT crash the API — just log the error
        console.error(`❌ Failed to send email to ${patientEmail}:`, error.message);
        return { success: false, error: error.message };
    }
};

// ──────────────────────────────────────────────
// Send generic notification alert email
// Used by the Notification Alert service
// ──────────────────────────────────────────────
const sendNotificationAlert = async ({ patientEmail, patientName, subject, message }) => {
    try {
        const transporter = createTransporter();

        const htmlContent = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8f9fa; border-radius: 12px; overflow: hidden;">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #1e293b, #0f172a); padding: 30px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">🔔 VaxTrack Alert</h1>
          <p style="color: #94a3b8; margin: 8px 0 0;">Important Notification</p>
        </div>
        
        <!-- Body -->
        <div style="padding: 30px;">
          <h2 style="color: #0f172a; margin-top: 0;">${subject}</h2>
          
          <p style="color: #374151; line-height: 1.6;">
            Dear <strong>${patientName || 'User'}</strong>,
          </p>
          
          <div style="background: white; border-left: 4px solid #3b82f6; border-radius: 4px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); font-size: 15px; color: #333; line-height: 1.6; margin: 20px 0;">
            ${message}
          </div>
          
          <p style="color: #6b7280; font-size: 13px; margin-top: 30px;">
            If you have any questions, please contact your healthcare provider or reach out to VaxTrack support.
          </p>
        </div>
        
        <!-- Footer -->
        <div style="background: #1e293b; padding: 20px; text-align: center;">
          <p style="color: #94a3b8; margin: 0; font-size: 12px;">
            This is an automated message from VaxTrack. Do not reply to this email.
          </p>
        </div>
      </div>
    `;

        const mailOptions = {
            from: `"VaxTrack Alerts" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
            to: patientEmail,
            subject: `VaxTrack Alert — ${subject}`,
            html: htmlContent,
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`✅ Notification alert email sent to ${patientEmail} (Message ID: ${info.messageId})`);
        return { success: true, messageId: info.messageId };

    } catch (error) {
        console.error(`❌ Failed to send notification email to ${patientEmail}:`, error.message);
        return { success: false, error: error.message };
    }
};

export { sendVaccinationConfirmation, sendNotificationAlert };
