/**
 * ExamSphere — MCQ Examination Mock Data
 *
 * Realistic Computer Science questions for a 6th-Semester CBT exam.
 * Correct answers are stored SEPARATELY and must NEVER be sent to
 * the student client in a real deployment.
 */

export const examMeta = {
  id: 'CBT-2026-CS601',
  courseCode: '22CS601',
  courseTitle: 'Software Engineering & Cloud Architecture',
  institution: 'Dr. Ambedkar Institute of Technology',
  semester: '6th Semester B.E. (Autonomous)',
  examDate: '21 Nov 2026',
  totalMarks: 50,
  durationMinutes: 90,
  totalQuestions: 25,
  marksPerQuestion: 2,
  negativeMarking: false,
  instructions: [
    '25 multiple-choice questions, 2 marks each. No negative marking.',
    'Select one option per question.',
    'You can revisit questions and change answers until you submit. Use Mark for review to flag a question.',
    'The examination is submitted automatically when time runs out.',
    'Once submitted, answers cannot be changed.',
  ],
};

/**
 * Questions — only id, text, and options are needed on the client.
 * The `correctOption` field is included here for mock grading only
 * and must be stripped before sending to students in production.
 */
export const examQuestions = [
  {
    id: 1,
    text: 'Which software development model is best suited when requirements are well understood and unlikely to change?',
    options: [
      'Waterfall Model',
      'Spiral Model',
      'Agile Model',
      'Prototype Model',
    ],
    correctOption: 0,
  },
  {
    id: 2,
    text: 'In UML, which diagram is used to represent the dynamic behaviour of a system by showing object interactions over time?',
    options: [
      'Class Diagram',
      'Sequence Diagram',
      'Component Diagram',
      'Deployment Diagram',
    ],
    correctOption: 1,
  },
  {
    id: 3,
    text: 'What does the "S" stand for in the SOLID principles of object-oriented design?',
    options: [
      'Substitution Principle',
      'Single Responsibility Principle',
      'Separation of Concerns',
      'State Management Principle',
    ],
    correctOption: 1,
  },
  {
    id: 4,
    text: 'Which cloud service model provides the highest level of abstraction to the user?',
    options: [
      'Infrastructure as a Service (IaaS)',
      'Platform as a Service (PaaS)',
      'Software as a Service (SaaS)',
      'Function as a Service (FaaS)',
    ],
    correctOption: 2,
  },
  {
    id: 5,
    text: 'In a microservices architecture, which pattern is used to aggregate data from multiple services into a single response?',
    options: [
      'Circuit Breaker',
      'API Gateway',
      'Saga Pattern',
      'Service Mesh',
    ],
    correctOption: 1,
  },
  {
    id: 6,
    text: 'Which testing technique involves testing without knowledge of the internal structure of the application?',
    options: [
      'White-box Testing',
      'Grey-box Testing',
      'Black-box Testing',
      'Unit Testing',
    ],
    correctOption: 2,
  },
  {
    id: 7,
    text: 'What is the primary purpose of a container orchestration tool like Kubernetes?',
    options: [
      'Writing source code',
      'Managing and scaling containerized applications',
      'Compiling applications',
      'Designing user interfaces',
    ],
    correctOption: 1,
  },
  {
    id: 8,
    text: 'Which of the following is NOT a characteristic of cloud computing as defined by NIST?',
    options: [
      'On-demand self-service',
      'Broad network access',
      'Dedicated hardware allocation',
      'Rapid elasticity',
    ],
    correctOption: 2,
  },
  {
    id: 9,
    text: 'In Agile methodology, what is a "Sprint Retrospective"?',
    options: [
      'A meeting to plan the next sprint',
      'A review of completed work with stakeholders',
      'A meeting to reflect on the process and identify improvements',
      'A daily standup meeting',
    ],
    correctOption: 2,
  },
  {
    id: 10,
    text: 'What is the purpose of a load balancer in a cloud architecture?',
    options: [
      'To store data persistently',
      'To distribute incoming traffic across multiple servers',
      'To encrypt data at rest',
      'To compile application code',
    ],
    correctOption: 1,
  },
  {
    id: 11,
    text: 'Which software metric measures the percentage of code executed during testing?',
    options: [
      'Cyclomatic Complexity',
      'Code Coverage',
      'Function Point Analysis',
      'Lines of Code (LOC)',
    ],
    correctOption: 1,
  },
  {
    id: 12,
    text: 'In the context of CI/CD, what does "Continuous Deployment" mean?',
    options: [
      'Code is manually deployed after every commit',
      'Every change that passes automated tests is deployed to production automatically',
      'Deployment happens once a week',
      'Code is deployed only after a formal review meeting',
    ],
    correctOption: 1,
  },
  {
    id: 13,
    text: 'Which design pattern ensures a class has only one instance and provides a global point of access?',
    options: [
      'Factory Pattern',
      'Observer Pattern',
      'Singleton Pattern',
      'Strategy Pattern',
    ],
    correctOption: 2,
  },
  {
    id: 14,
    text: 'What is "Infrastructure as Code" (IaC)?',
    options: [
      'Writing application code that runs on infrastructure',
      'Managing and provisioning infrastructure through machine-readable configuration files',
      'Coding directly on production servers',
      'A programming language for building servers',
    ],
    correctOption: 1,
  },
  {
    id: 15,
    text: 'Which requirement engineering technique involves creating a simplified working model to gather feedback?',
    options: [
      'Brainstorming',
      'Prototyping',
      'Document Analysis',
      'Benchmarking',
    ],
    correctOption: 1,
  },
  {
    id: 16,
    text: 'In a RESTful API design, which HTTP method is idempotent and used to update a resource completely?',
    options: [
      'POST',
      'PATCH',
      'PUT',
      'DELETE',
    ],
    correctOption: 2,
  },
  {
    id: 17,
    text: 'What is the main advantage of serverless computing?',
    options: [
      'Complete control over server hardware',
      'Automatic scaling and no server management required',
      'Lower latency than all other models',
      'Better security than traditional hosting',
    ],
    correctOption: 1,
  },
  {
    id: 18,
    text: 'Which software process model combines iterative development with systematic risk analysis?',
    options: [
      'V-Model',
      'Incremental Model',
      'Spiral Model',
      'RAD Model',
    ],
    correctOption: 2,
  },
  {
    id: 19,
    text: 'In Docker, what is the difference between an image and a container?',
    options: [
      'They are the same thing',
      'An image is a running instance; a container is a template',
      'An image is a read-only template; a container is a running instance of an image',
      'A container is used for storage; an image is used for computation',
    ],
    correctOption: 2,
  },
  {
    id: 20,
    text: 'Which type of coupling between software modules is considered the most desirable?',
    options: [
      'Content Coupling',
      'Common Coupling',
      'Data Coupling',
      'Control Coupling',
    ],
    correctOption: 2,
  },
  {
    id: 21,
    text: 'What is the CAP theorem in distributed systems?',
    options: [
      'A system can achieve Computation, Availability, and Performance simultaneously',
      'A distributed system can guarantee at most two of Consistency, Availability, and Partition Tolerance',
      'Cloud Applications must be Partitioned for performance',
      'Containers, APIs, and Platforms form the foundation of cloud systems',
    ],
    correctOption: 1,
  },
  {
    id: 22,
    text: 'Which Agile framework uses roles such as Product Owner, Scrum Master, and Development Team?',
    options: [
      'Kanban',
      'Extreme Programming (XP)',
      'Scrum',
      'Lean Software Development',
    ],
    correctOption: 2,
  },
  {
    id: 23,
    text: 'In software engineering, what does "technical debt" refer to?',
    options: [
      'The financial cost of purchasing development tools',
      'The implied cost of future rework caused by choosing a quick solution now',
      'The salary owed to technical staff',
      'The cost of cloud infrastructure',
    ],
    correctOption: 1,
  },
  {
    id: 24,
    text: 'Which cloud deployment model provides infrastructure exclusively for a single organization?',
    options: [
      'Public Cloud',
      'Private Cloud',
      'Hybrid Cloud',
      'Community Cloud',
    ],
    correctOption: 1,
  },
  {
    id: 25,
    text: 'What is the primary purpose of an API Gateway in a microservices architecture?',
    options: [
      'To store microservice data',
      'To serve as the single entry point for client requests and route them to appropriate services',
      'To compile microservices',
      'To replace all microservices with a monolith',
    ],
    correctOption: 1,
  },
];
