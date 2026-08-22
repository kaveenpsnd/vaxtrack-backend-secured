import User from '../models/User.js';
import { sendNotificationAlert } from '../services/emailService.js';

// @desc    Trigger an email notification alert
// @route   POST /api/notifications/send
// @access  Private
export const triggerNotification = async (req, res) => {
  try {
    const { email, userId, subject, message } = req.body;

    if (!subject || !message) {
      return res.status(400).json({
        success: false,
        message: 'Subject and message are required',
      });
    }

    let targetEmail = email;
    let targetName = 'User';

    // If an email wasn't explicitly provided, try looking up via userId
    if (!targetEmail && userId) {
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found for the provided userId',
        });
      }
      targetEmail = user.email;
      targetName = user.name || 'User';
    } else if (!targetEmail && req.user) {
      // Fallback to currently logged-in user if neither email nor userId is explicitly provided
      targetEmail = req.user.email;
      targetName = req.user.name;
    }

    if (!targetEmail) {
      return res.status(400).json({
        success: false,
        message: 'A target email or valid userId is required to send notifications',
      });
    }

    // Send the email via the emailService we just built
    const result = await sendNotificationAlert({
      patientEmail: targetEmail,
      patientName: targetName,
      subject: subject,
      message: message,
    });

    if (result.success) {
      return res.status(200).json({
        success: true,
        message: 'Notification alert triggered and sent successfully',
      });
    } else {
      return res.status(500).json({
        success: false,
        message: 'Failed to send notification email',
        error: result.error,
      });
    }
  } catch (error) {
    console.error('Trigger notification error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while triggering notification',
      error: error.message,
    });
  }
};
