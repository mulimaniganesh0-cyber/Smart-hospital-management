const SUPPORTED = new Set(['en', 'kn', 'hi']);
const text = {
  en: { emergency: 'This could be an emergency. Please call 112 or 108 or seek emergency care immediately. If possible, ask someone nearby to help and avoid driving yourself.', sos: 'Emergency SOS', hospitals: 'View Hospitals', book: 'Book Appointment', addressUnavailable: 'Address unavailable', nearbyHospitals: 'Here are the hospitals near your current location.', nearbyDoctors: 'Here are the matching doctors and hospitals near your current location.', hospitalsFound: 'Here are the matching hospitals from the hospital directory.', locationRequired: 'Location permission is required to find hospitals near you. Please enable location and try again.', directoryUnavailable: "I couldn't retrieve the hospital information right now. Please try again.", clarification: 'What would you like me to help you find?' },
  kn: { emergency: 'ಇದು ತುರ್ತು ಪರಿಸ್ಥಿತಿಯಾಗಿರಬಹುದು. ದಯವಿಟ್ಟು ತಕ್ಷಣ 112 ಅಥವಾ 108 ಗೆ ಕರೆ ಮಾಡಿ ಅಥವಾ ಸಮೀಪದ ತುರ್ತು ಚಿಕಿತ್ಸೆಗೆ ಹೋಗಿ. ಸಾಧ್ಯವಾದರೆ ಹತ್ತಿರದವರ ಸಹಾಯ ಪಡೆಯಿರಿ ಮತ್ತು ನೀವೇ ವಾಹನ ಚಲಾಯಿಸಬೇಡಿ.', sos: 'ತುರ್ತು ಸಹಾಯ', hospitals: 'ಆಸ್ಪತ್ರೆಗಳನ್ನು ನೋಡಿ', book: 'ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ಬುಕ್ ಮಾಡಿ', addressUnavailable: 'ವಿಳಾಸ ಲಭ್ಯವಿಲ್ಲ', nearbyHospitals: 'ನಿಮ್ಮ ಪ್ರಸ್ತುತ ಸ್ಥಳದ ಸಮೀಪದಲ್ಲಿರುವ ಆಸ್ಪತ್ರೆಗಳು ಇಲ್ಲಿವೆ.', nearbyDoctors: 'ನಿಮ್ಮ ಪ್ರಸ್ತುತ ಸ್ಥಳದ ಸಮೀಪದಲ್ಲಿರುವ ಹೊಂದಾಣಿಕೆಯ ವೈದ್ಯರು ಮತ್ತು ಆಸ್ಪತ್ರೆಗಳು ಇಲ್ಲಿವೆ.', hospitalsFound: 'ಆಸ್ಪತ್ರೆ ಡೈರೆಕ್ಟರಿಯಲ್ಲಿರುವ ಹೊಂದಾಣಿಕೆಯ ಆಸ್ಪತ್ರೆಗಳು ಇಲ್ಲಿವೆ.', locationRequired: 'ನಿಮ್ಮ ಹತ್ತಿರದ ಆಸ್ಪತ್ರೆಗಳನ್ನು ಹುಡುಕಲು ಸ್ಥಳ ಅನುಮತಿ ಅಗತ್ಯವಿದೆ. ದಯವಿಟ್ಟು ಸ್ಥಳವನ್ನು ಸಕ್ರಿಯಗೊಳಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.', directoryUnavailable: 'ಈಗ ಆಸ್ಪತ್ರೆಗಳ ಮಾಹಿತಿಯನ್ನು ಪಡೆಯಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.', clarification: 'ನೀವು ಏನನ್ನು ಹುಡುಕಲು ಸಹಾಯ ಬೇಕು?' },
  hi: { emergency: 'यह एक आपात स्थिति हो सकती है। कृपया तुरंत 112 या 108 पर कॉल करें या निकटतम आपात चिकित्सा केंद्र जाएँ। संभव हो तो किसी पास के व्यक्ति की मदद लें और स्वयं वाहन न चलाएँ।', sos: 'आपातकालीन सहायता', hospitals: 'अस्पताल देखें', book: 'अपॉइंटमेंट बुक करें', addressUnavailable: 'पता उपलब्ध नहीं', nearbyHospitals: 'आपके वर्तमान स्थान के पास के अस्पताल यहां हैं।', nearbyDoctors: 'आपके वर्तमान स्थान के पास के मिलते-जुलते डॉक्टर और अस्पताल यहां हैं।', hospitalsFound: 'अस्पताल निर्देशिका से मिलते-जुलते अस्पताल यहां हैं।', locationRequired: 'आपके पास के अस्पताल खोजने के लिए स्थान अनुमति आवश्यक है। कृपया स्थान सक्षम करके फिर प्रयास करें।', directoryUnavailable: 'अभी अस्पताल की जानकारी प्राप्त नहीं हो सकी। कृपया फिर से प्रयास करें।', clarification: 'आप क्या ढूंढने में मदद चाहते हैं?' },
};
const specialties = {
  Orthopedics: ['ಮೂಳೆ ಮತ್ತು ಸಂಧಿ ತಜ್ಞ', 'हड्डी और जोड़ विशेषज्ञ'],
  Urology: ['ಮೂತ್ರನಾಳ ತಜ್ಞ', 'मूत्र रोग विशेषज्ञ'],
  'General Medicine': ['ಸಾಮಾನ್ಯ ವೈದ್ಯಕೀಯ', 'सामान्य चिकित्सा'],
  'Obstetrics and Gynecology': ['ಸ್ತ್ರೀರೋಗ ಮತ್ತು ಪ್ರಸೂತಿ', 'स्त्री रोग एवं प्रसूति'],
  'Gynaecology and Obstetrics': ['ಸ್ತ್ರೀರೋಗ ಮತ್ತು ಪ್ರಸೂತಿ', 'स्त्री रोग एवं प्रसूति'],
  Pediatrics: ['ಮಕ್ಕಳ ವೈದ್ಯಕೀಯ', 'बाल चिकित्सा'],
  Dermatology: ['ಚರ್ಮರೋಗ ತಜ್ಞ', 'त्वचा रोग विशेषज्ञ'],
};
const names = {
  'Diyaa Multispeciality Hospital Chikodi': ['ದಿಯಾ ಮಲ್ಟಿಸ್ಪೆಷಾಲಿಟಿ ಆಸ್ಪತ್ರೆ ಚಿಕ್ಕೋಡಿ', 'दिया मल्टीस्पेशलिटी अस्पताल चिकोडी'],
  'Sri Satya Sai Hospital': ['ಶ್ರೀ ಸತ್ಯ ಸಾಯಿ ಆಸ್ಪತ್ರೆ', 'श्री सत्य साई अस्पताल'],
  'MJ Hospital': ['ಎಂ.ಜೆ. ಆಸ್ಪತ್ರೆ', 'एम.जे. अस्पताल'],
  'Dr. Sanjeev A. Patil': ['ಡಾ. ಸಂಜೀವ್ ಎ. ಪಾಟೀಲ್', 'डॉ. संजीव ए. पाटील'],
  'Dr. Abhijit': ['ಡಾ. ಅಭಿಜಿತ್', 'डॉ. अभिजीत'],
};
function language(value) { return SUPPORTED.has(value) ? value : 'en'; }
function displayName(value, lang) { const match = names[value]; return match && lang !== 'en' ? match[lang === 'kn' ? 0 : 1] : value; }
function displaySpecialty(value, lang) { const match = specialties[value]; return match && lang !== 'en' ? `${match[lang === 'kn' ? 0 : 1]} (${value})` : value; }
function localizeDoctor(doctor, lang) { return { ...doctor, display_name: displayName(doctor.name, lang), display_specialization: displaySpecialty(doctor.specialization, lang) }; }
function localizeHospital(hospital, lang) { return { ...hospital, display_name: displayName(hospital.name, lang), display_address: hospital.address || text[lang].addressUnavailable, doctors: (hospital.doctors || []).map((doctor) => localizeDoctor(doctor, lang)) }; }
module.exports = { language, text, localizeDoctor, localizeHospital };
