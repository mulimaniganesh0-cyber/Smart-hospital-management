// src/utils/emailService.js
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

exports.sendEmail = async (to, subject, html) => {
  try {
    await transporter.sendMail({
      from: `"Hospital Resource System" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
    return true;
  } catch (error) {
    console.error('Email sending failed:', error);
    return false;
  }
};

exports.sendWelcomeEmail = async (email, name, userType) => {
  const subject = 'Welcome to Hospital Resource Management System';
  const html = `
    <h1>Welcome ${name}!</h1>
    <p>Your account has been successfully created as ${userType}.</p>
    <p>You can now login to access the system.</p>
    <br>
    <p>Best regards,<br>Hospital Resource Team</p>
  `;
  return await exports.sendEmail(email, subject, html);
};

exports.sendAppointmentConfirmation = async (email, patientName, appointmentDetails) => {
  const subject = 'Appointment Confirmation';
  const html = `
    <h1>Appointment Confirmed</h1>
    <p>Dear ${patientName},</p>
    <p>Your appointment has been confirmed with the following details:</p>
    <ul>
      <li>Hospital: ${appointmentDetails.hospitalName}</li>
      <li>Doctor: ${appointmentDetails.doctorName}</li>
      <li>Date: ${appointmentDetails.date}</li>
      <li>Time: ${appointmentDetails.time}</li>
    </ul>
    <p>Please arrive 15 minutes before your scheduled time.</p>
  `;
  return await exports.sendEmail(email, subject, html);
};