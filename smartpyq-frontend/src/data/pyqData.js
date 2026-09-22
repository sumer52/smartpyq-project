// SmartPYQ - Osmania University PYQ Data Structure
// Flow: Stream -> Specialization -> Semester -> Subject -> PYQ Year -> PDF

export const pyqYears = [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027];

export const pyqData = {
  streams: {
    bsc: {
      id: 'bsc', name: 'B.Sc', displayName: 'B.Sc', icon: '🎓',
      specializations: {
        mscs: {
          id: 'mscs', name: 'Mathematics, Statistics & Computer Science', displayName: 'MSCS',
          semesters: {
            sem1: ['Mathematics', 'Statistics', 'Computer Science', 'English', 'Hindi', 'Sanskrit'],
            sem2: ['Mathematics', 'Statistics', 'Computer Science', 'English', 'Hindi', 'Sanskrit'],
            sem3: ['Mathematics', 'Statistics', 'Computer Science', 'English', 'Hindi', 'Sanskrit'],
            sem4: ['Mathematics', 'Statistics', 'Computer Science', 'English', 'Hindi', 'Sanskrit'],
            sem5: ['Mathematics', 'Statistics', 'Computer Science', 'English', 'Hindi', 'Sanskrit'],
            sem6: ['Mathematics', 'Statistics', 'Computer Science', 'English', 'Hindi', 'Sanskrit'],
          }
        },
        msds: {
          id: 'msds', name: 'Mathematics, Statistics & Data Science', displayName: 'MSDS',
          semesters: {
            sem1: ['Mathematics', 'Statistics', 'Data Science', 'English', 'Hindi', 'Sanskrit'],
            sem2: ['Mathematics', 'Statistics', 'Data Science', 'English', 'Hindi', 'Sanskrit'],
            sem3: ['Mathematics', 'Statistics', 'Data Science', 'English', 'Hindi', 'Sanskrit'],
            sem4: ['Mathematics', 'Statistics', 'Data Science', 'English', 'Hindi', 'Sanskrit'],
            sem5: ['Mathematics', 'Statistics', 'Data Science', 'English', 'Hindi', 'Sanskrit'],
            sem6: ['Mathematics', 'Statistics', 'Data Science', 'English', 'Hindi', 'Sanskrit'],
          }
        },
        mpc: {
          id: 'mpc', name: 'Mathematics, Physics & Chemistry', displayName: 'MPC',
          semesters: {
            sem1: ['Mathematics', 'Physics', 'Chemistry', 'English', 'Hindi', 'Sanskrit'],
            sem2: ['Mathematics', 'Physics', 'Chemistry', 'English', 'Hindi', 'Sanskrit'],
            sem3: ['Mathematics', 'Physics', 'Chemistry', 'English', 'Hindi', 'Sanskrit'],
            sem4: ['Mathematics', 'Physics', 'Chemistry', 'English', 'Hindi', 'Sanskrit'],
            sem5: ['Mathematics', 'Physics', 'Chemistry', 'English', 'Hindi', 'Sanskrit'],
            sem6: ['Mathematics', 'Physics', 'Chemistry', 'English', 'Hindi', 'Sanskrit'],
          }
        },
        bipc: {
          id: 'bipc', name: 'Botany, Zoology & Chemistry (Life Science)', displayName: 'BiPC',
          semesters: {
            sem1: ['Botany', 'Zoology', 'Chemistry', 'Life Science', 'English', 'Hindi', 'Sanskrit'],
            sem2: ['Botany', 'Zoology', 'Chemistry', 'Life Science', 'English', 'Hindi', 'Sanskrit'],
            sem3: ['Botany', 'Zoology', 'Chemistry', 'Life Science', 'English', 'Hindi', 'Sanskrit'],
            sem4: ['Botany', 'Zoology', 'Chemistry', 'Life Science', 'English', 'Hindi', 'Sanskrit'],
            sem5: ['Botany', 'Zoology', 'Chemistry', 'Life Science', 'English', 'Hindi', 'Sanskrit'],
            sem6: ['Botany', 'Zoology', 'Chemistry', 'Life Science', 'English', 'Hindi', 'Sanskrit'],
          }
        }
      }
    },
    bcom: {
      id: 'bcom', name: 'B.Com', displayName: 'B.Com', icon: '💼',
      specializations: {
        general: {
          id: 'general', name: 'General', displayName: 'General',
          semesters: {
            sem1: ['Accounting - I', 'Business Management', 'Basics of Marketing', 'Economics', 'English', 'Hindi', 'Sanskrit'],
            sem2: ['Accounting - II', 'Business Law', 'Banking Services', 'English', 'Hindi', 'Sanskrit'],
            sem3: ['Business Statistics - I', 'Advanced Accounting', 'Auditing', 'English', 'Hindi', 'Sanskrit'],
            sem4: ['Business Statistics - II', 'Corporate Accounting', 'Income Tax', 'English', 'Hindi', 'Sanskrit'],
            sem5: ['Cost Accounting', 'Advanced Corporate Accounting', 'Advanced Income Tax', 'Computerized Accounting', 'English', 'Hindi', 'Sanskrit'],
            sem6: ['Accounting Standards', 'Cost Control', 'Auditing', 'Corporate Accounting', 'English', 'Hindi', 'Sanskrit'],
          }
        },
        compapps: {
          id: 'compapps', name: 'Computer Applications', displayName: 'Computer Applications',
          semesters: {
            sem1: ['Financial Accounting', 'Business Management', 'Computer Fundamentals', 'English', 'Hindi', 'Sanskrit'],
            sem2: ['Advanced Accounting', 'Business Law', 'Computer Applications', 'English', 'Hindi', 'Sanskrit'],
            sem3: ['Business Statistics', 'Corporate Accounting', 'Database Management', 'English', 'Hindi', 'Sanskrit'],
            sem4: ['Income Tax', 'Computerized Accounting', 'Programming', 'English', 'Hindi', 'Sanskrit'],
            sem5: ['Cost Accounting', 'Advanced Accounting', 'Advanced Income Tax', 'English', 'Hindi', 'Sanskrit'],
            sem6: ['Accounting Standards', 'Auditing', 'Computer Applications', 'English', 'Hindi', 'Sanskrit'],
          }
        },
        honours: {
          id: 'honours', name: 'Honours', displayName: 'Honours',
          semesters: {
            sem1: ['Financial Accounting', 'Business Management', 'Economics'],
            sem2: ['Advanced Accounting', 'Business Law', 'Business Statistics'],
            sem3: ['Corporate Accounting', 'Auditing', 'Financial Management'],
            sem4: ['Income Tax', 'Cost Accounting', 'Management Accounting'],
            sem5: ['Advanced Corporate Accounting', 'Advanced Income Tax', 'Financial Management'],
            sem6: ['Accounting Standards', 'Auditing', 'Cost Control'],
          }
        },
        busanalytics: {
          id: 'busanalytics', name: 'Business Analytics', displayName: 'Business Analytics',
          semesters: {
            sem1: ['Financial Accounting', 'Business Economics', 'Business Statistics', 'English', 'Hindi', 'Sanskrit'],
            sem2: ['Advanced Accounting', 'Business Analytics Fundamentals', 'Business Law', 'English', 'Hindi', 'Sanskrit'],
            sem3: ['Data Analytics', 'Financial Management', 'Business Statistics', 'English', 'Hindi', 'Sanskrit'],
            sem4: ['Predictive Analytics', 'Cost Accounting', 'Database Management', 'English', 'Hindi', 'Sanskrit'],
            sem5: ['Business Intelligence', 'Data Visualization', 'Management Accounting', 'English', 'Hindi', 'Sanskrit'],
            sem6: ['Advanced Business Analytics', 'Financial Analytics', 'Business Intelligence', 'English', 'Hindi', 'Sanskrit'],
          }
        }
      }
    },
    bca: {
      id: 'bca', name: 'BCA', displayName: 'BCA', icon: '💻',
      specializations: {
        general: {
          id: 'general', name: 'General', displayName: 'General',
          semesters: {
            sem1: ['Programming Fundamentals', 'Computer Fundamentals', 'Mathematics'],
            sem2: ['Data Structures', 'Object Oriented Programming', 'Database Management Systems'],
            sem3: ['Operating Systems', 'Computer Networks', 'Software Engineering'],
            sem4: ['DBMS using Python', 'Artificial Intelligence', 'Network Security'],
            sem5: ['.NET Programming', 'UNIX Programming', 'Software Testing'],
            sem6: ['Advanced Programming', 'Information Security', 'Project'],
          },
        },
        datasci: {
          id: 'datasci', name: 'Data Science & Analytics', displayName: 'Data Science',
          semesters: {
            sem1: ['Programming Fundamentals', 'Data Science Basics', 'Mathematics'],
            sem2: ['Data Structures', 'Statistics for Data Science', 'Database Management'],
            sem3: ['Machine Learning', 'Data Mining', 'Computer Networks'],
            sem4: ['Deep Learning', 'Big Data Analytics', 'Cloud Computing'],
            sem5: ['Natural Language Processing', 'Data Visualization', 'Ethics in AI'],
            sem6: ['Capstone Project', 'Advanced Analytics', 'Project'],
          }
        },
        cloud: {
          id: 'cloud', name: 'Cloud Computing & DevOps', displayName: 'Cloud Computing',
          semesters: {
            sem1: ['Programming Fundamentals', 'Computer Fundamentals', 'Mathematics'],
            sem2: ['Data Structures', 'Object Oriented Programming', 'Linux Administration'],
            sem3: ['Cloud Architecture', 'Virtualization', 'Computer Networks'],
            sem4: ['AWS/Azure Services', 'Containerization', 'CI/CD Pipelines'],
            sem5: ['DevOps Practices', 'Infrastructure as Code', 'Kubernetes'],
            sem6: ['Cloud Security', 'Serverless Architecture', 'Project'],
          }
        },
        cyber: {
          id: 'cyber', name: 'Cyber Security & Forensics', displayName: 'Cyber Security',
          semesters: {
            sem1: ['Programming Fundamentals', 'Computer Fundamentals', 'Mathematics'],
            sem2: ['Data Structures', 'Network Fundamentals', 'Operating Systems'],
            sem3: ['Cyber Security Fundamentals', 'Cryptography', 'Web Security'],
            sem4: ['Ethical Hacking', 'Digital Forensics', 'Malware Analysis'],
            sem5: ['Incident Response', 'Security Auditing', 'Cloud Security'],
            sem6: ['Cyber Law', 'Penetration Testing', 'Project'],
          }
        }
      }
    },
    bba: {
      id: 'bba', name: 'BBA', displayName: 'BBA', icon: '📊',
      specializations: {
        general: {
          id: 'general', name: 'General', displayName: 'General',
          semesters: {
            sem1: ['Principles of Management', 'Basics of Marketing', 'Economics', 'English', 'Hindi', 'Sanskrit'],
            sem2: ['Financial Accounting', 'Business Statistics', 'Organizational Behaviour', 'English', 'Hindi', 'Sanskrit'],
            sem3: ['Human Resource Management', 'Information Technology', 'Financial Management', 'English', 'Hindi', 'Sanskrit'],
            sem4: ['Market Research', 'Management Science', 'Business Law', 'English', 'Hindi', 'Sanskrit'],
            sem5: ['Financial Asset Management', 'Financial Markets', 'Mobile Commerce', 'English', 'Hindi', 'Sanskrit'],
            sem6: ['Supply Chain Management', 'Business Intelligence', 'Customer Relationship Management', 'English', 'Hindi', 'Sanskrit'],
          }
        },
        finance: {
          id: 'finance', name: 'Finance & Banking', displayName: 'Finance',
          semesters: {
            sem1: ['Principles of Management', 'Financial Accounting', 'Economics', 'English'],
            sem2: ['Business Statistics', 'Corporate Finance', 'Banking Theory & Practice', 'English'],
            sem3: ['Financial Markets', 'Investment Analysis', 'Risk Management', 'English'],
            sem4: ['Portfolio Management', 'Insurance & Banking', 'Business Law', 'English'],
            sem5: ['Financial Derivatives', 'International Finance', 'Tax Planning', 'English'],
            sem6: ['Financial Planning', 'Wealth Management', 'Project', 'English'],
          }
        },
        hrm: {
          id: 'hrm', name: 'Human Resource Management', displayName: 'HRM',
          semesters: {
            sem1: ['Principles of Management', 'Organizational Behaviour', 'Economics', 'English'],
            sem2: ['Business Statistics', 'Human Resource Management', 'Business Communication', 'English'],
            sem3: ['Recruitment & Selection', 'Training & Development', 'Labour Laws', 'English'],
            sem4: ['Performance Management', 'Compensation Management', 'Organizational Development', 'English'],
            sem5: ['Strategic HRM', 'Employee Relations', 'HR Analytics', 'English'],
            sem6: ['International HRM', 'Workplace Psychology', 'Project', 'English'],
          }
        },
        marketing: {
          id: 'marketing', name: 'Marketing Management', displayName: 'Marketing',
          semesters: {
            sem1: ['Principles of Management', 'Basics of Marketing', 'Economics', 'English'],
            sem2: ['Business Statistics', 'Consumer Behaviour', 'Advertising Management', 'English'],
            sem3: ['Digital Marketing', 'Sales & Distribution Management', 'Brand Management', 'English'],
            sem4: ['Market Research', 'Services Marketing', 'Rural Marketing', 'English'],
            sem5: ['International Marketing', 'Marketing Analytics', 'E-Commerce', 'English'],
            sem6: ['Strategic Marketing', 'Social Media Marketing', 'Project', 'English'],
          }
        }
      }
    }
  }
};

// Helper functions
export const getStreams = () => pyqData.streams;
export const getSpecializations = (streamId) => pyqData.streams[streamId]?.specializations || {};
export const getSemesters = (streamId, specId) => pyqData.streams[streamId]?.specializations[specId]?.semesters || {};
export const getSubjects = (streamId, specId, semId) => pyqData.streams[streamId]?.specializations[specId]?.semesters[semId] || [];
export const getPyqYears = () => pyqYears;
export const getSemesterOptions = () => [
  { id: 'sem1', name: 'Semester 1', displayName: 'Sem 1' },
  { id: 'sem2', name: 'Semester 2', displayName: 'Sem 2' },
  { id: 'sem3', name: 'Semester 3', displayName: 'Sem 3' },
  { id: 'sem4', name: 'Semester 4', displayName: 'Sem 4' },
  { id: 'sem5', name: 'Semester 5', displayName: 'Sem 5' },
  { id: 'sem6', name: 'Semester 6', displayName: 'Sem 6' },
];

// Get all subjects for a stream + semester (aggregated across all specializations)
export const getAllSubjectsForStreamSemester = (streamId, semId) => {
  const specs = getSpecializations(streamId);
  const subjectSet = new Set();
  Object.values(specs).forEach(spec => {
    if (spec.semesters && spec.semesters[semId]) {
      spec.semesters[semId].forEach(s => subjectSet.add(s));
    }
  });
  return Array.from(subjectSet).sort();
};

// Get all semesters that exist for a given stream
export const getAvailableSemesters = (streamId) => {
  const specs = getSpecializations(streamId);
  const semSet = new Set();
  Object.values(specs).forEach(spec => {
    if (spec.semesters) {
      Object.keys(spec.semesters).forEach(s => semSet.add(s));
    }
  });
  return Array.from(semSet).sort();
};
