/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import {
  BookOpen,
  Users,
  Clock,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  UserPlus,
  Trash2,
  Upload,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  X,
  MessageSquare,
  Zap,
  Plus,
  Minus,
  ArrowUp,
  ArrowDown,
  Sun,
  Moon,
  History,
  LogIn,
  LogOut,
  LayoutDashboard,
  Info,
  HelpCircle,
  Bell,
  Check,
  ArrowUpDown,
  Monitor,
  Minimize2,
  Maximize2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- Utility ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
interface LessonPoint {
  id: string;
  title: string;
  duration: number; // minutes
  focusTask?: string; // Specific task to focus on
}

interface Student {
  id: string;
  name: string;
}

interface User {
  id: number;
  email: string;
  name: string;
}

interface SavedSession {
  id: number;
  title: string;
  goal: string;
  content: string;
  lesson_points: LessonPoint[];
  students: Student[];
  created_at: string;
}

interface TourStep {
  target: string;
  content: string;
  position: 'top' | 'bottom' | 'left' | 'right';
}

interface Notification {
  id: number;
  type: 'deadline' | 'absence' | 'message' | 'system';
  title: string;
  message: string;
  is_read: number;
  created_at: string;
}

// --- API Service ---
const getGeminiResponse = async (prompt: string, context?: string) => {
  try {
    const token = localStorage.getItem('token');
    const response = await fetch('/api/ai/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ prompt, context })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `API call failed with status ${response.status}`);
    }
    const data = await response.json();
    return data.text || "Aucune réponse générée.";
  } catch (error: any) {
    console.error("Gemini Error:", error);
    return `Erreur lors de l'appel à l'IA : ${error.message}. Vérifiez les variables d'environnement sur Vercel.`;
  }
};

// --- Context ---
const ThemeContext = React.createContext<{ theme: 'light' | 'dark' }>({ theme: 'light' });

// --- UI Components ---
const Card = ({ children, className, onClick, id }: { children: React.ReactNode, className?: string, onClick?: () => void, id?: string }) => {
  const { theme } = React.useContext(ThemeContext);
  return (
    <div
      id={id}
      onClick={onClick}
      className={cn(
        "border backdrop-blur-xl rounded-2xl p-6 shadow-sm transition-all duration-300",
        theme === 'dark'
          ? "bg-zinc-900/50 border-zinc-800 text-zinc-100 shadow-zinc-950/50"
          : "bg-white/80 border-zinc-200 text-zinc-900 shadow-zinc-200/50",
        onClick && "cursor-pointer hover:shadow-md",
        className
      )}
    >
      {children}
    </div>
  );
};

const Button = ({
  children,
  onClick,
  variant = 'primary',
  className,
  disabled,
  type = 'button'
}: {
  children: React.ReactNode,
  onClick?: () => void,
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger',
  className?: string,
  disabled?: boolean,
  type?: 'button' | 'submit' | 'reset'
}) => {
  const { theme } = React.useContext(ThemeContext);
  const variants = {
    primary: theme === 'dark'
      ? "bg-emerald-600 hover:bg-emerald-500 text-white"
      : "bg-emerald-500 hover:bg-emerald-600 text-white",
    secondary: theme === 'dark'
      ? "bg-zinc-800 hover:bg-zinc-700 text-zinc-100"
      : "bg-zinc-100 hover:bg-zinc-200 text-zinc-900",
    ghost: "bg-transparent hover:bg-zinc-500/10 text-zinc-500 hover:text-zinc-700",
    danger: "bg-red-500/10 hover:bg-red-500/20 text-red-500"
  };

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "px-4 py-2 rounded-xl font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed",
        variants[variant],
        className
      )}
    >
      {children}
    </button>
  );
};

// --- Main Component ---
export default function App() {
  // --- Auth & Session State ---
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authForm, setAuthForm] = useState({ email: '', password: '', name: '' });
  const [savedSessions, setSavedSessions] = useState<SavedSession[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);

  // --- App State ---
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [view, setView] = useState<'auth' | 'dashboard' | 'setup' | 'active'>('auth');
  const [sessionGoal, setSessionGoal] = useState("Maîtriser les fondamentaux du sujet d'aujourd'hui");
  const [students, setStudents] = useState<Student[]>([]);
  const [studentInput, setStudentInput] = useState("");
  const [pickedStudents, setPickedStudents] = useState<string[]>([]);
  const [lessonPoints, setLessonPoints] = useState<LessonPoint[]>([
    { id: '1', title: 'Introduction', duration: 5, focusTask: 'Accueillir les étudiants et fixer les objectifs' },
    { id: '2', title: 'Concepts Clés', duration: 15, focusTask: 'Expliquer la théorie principale avec des exemples' },
    { id: '3', title: 'Exercice Pratique', duration: 20, focusTask: 'Les étudiants travaillent sur la fiche d\'exercices' },
  ]);
  const [courseContent, setCourseContent] = useState("");
  const [currentPointIndex, setCurrentPointIndex] = useState(0);
  const [sortBy, setSortBy] = useState<'date' | 'title'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [timeLeft, setTimeLeft] = useState(0);
  const [isPresentationMode, setIsPresentationMode] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [isOvertime, setIsOvertime] = useState(false);

  const [isPicking, setIsPicking] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  // --- Deletion Confirmation State ---
  const [sessionToDelete, setSessionToDelete] = useState<number | null>(null);

  // --- Notification State ---
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const unreadCount = notifications.filter(n => !n.is_read).length;

  // --- Tour State ---
  const [showTour, setShowTour] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const tourSteps: TourStep[] = [
    { target: 'header-logo', content: 'Bienvenue sur AI Class Master ! Faisons un tour rapide.', position: 'bottom' },
    { target: 'session-goal', content: 'Définissez votre objectif principal pour le cours ici.', position: 'bottom' },
    { target: 'course-content', content: 'Téléchargez vos fichiers PDF ou TXT pour donner du contexte à Gemini.', position: 'bottom' },
    { target: 'student-roster', content: 'Ajoutez vos étudiants ici. Vous pouvez coller une liste !', position: 'top' },
    { target: 'lesson-planner', content: 'Planifiez vos segments de leçon et leurs durées.', position: 'left' },
    { target: 'start-btn', content: 'Prêt ? Cliquez ici pour démarrer votre session interactive !', position: 'top' }
  ];

  // --- Refs ---
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // --- Effects ---
  useEffect(() => {
    if (token) {
      fetchMe();
      fetchSessions();
      fetchNotifications();
      if (view === 'auth') setView('dashboard');
    } else {
      setView('auth');
    }
  }, [token]);
  useEffect(() => {
    if (isActive && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && isActive) {
      setIsOvertime(true);
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive, timeLeft]);

  // Reset timer when point changes
  useEffect(() => {
    if (view === 'active') {
      const currentPoint = lessonPoints[currentPointIndex];
      if (currentPoint) {
        setTimeLeft(currentPoint.duration * 60);
        setIsOvertime(false);
      }
    }
  }, [currentPointIndex, view, lessonPoints]);

  // --- Auth Handlers ---
  const fetchMe = async () => {
    try {
      const res = await fetch('/api/me', { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) setUser(await res.json());
      else logout();
    } catch (e) { logout(); }
  };

  const fetchSessions = async () => {
    setIsLoadingSessions(true);
    try {
      const res = await fetch('/api/sessions', { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) setSavedSessions(await res.json());
    } catch (e) { console.error(e); }
    setIsLoadingSessions(false);
  };

  const fetchNotifications = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/notifications', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) setNotifications(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  const markAsRead = async (id: number) => {
    if (!token) return;
    try {
      await fetch(`/api/notifications/${id}/read`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: 1 } : n));
    } catch (err) {
      console.error(err);
    }
  };

  const markAllAsRead = async () => {
    if (!token) return;
    try {
      await fetch('/api/notifications/read-all', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
    } catch (err) {
      console.error(err);
    }
  };

  const sortedSessions = useMemo(() => {
    return [...savedSessions].sort((a, b) => {
      if (sortBy === 'date') {
        const dateA = new Date(a.created_at).getTime();
        const dateB = new Date(b.created_at).getTime();
        return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
      } else {
        return sortOrder === 'desc'
          ? b.title.localeCompare(a.title)
          : a.title.localeCompare(b.title);
      }
    });
  }, [savedSessions, sortBy, sortOrder]);

  const toggleSort = (type: 'date' | 'title') => {
    if (sortBy === type) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(type);
      setSortOrder('desc');
    }
  };

  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Auth triggered", authMode, authForm.email);
    setIsAuthLoading(true);
    const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authForm)
      });
      const data = await res.json();
      console.log("Auth response", res.status, data);
      if (res.ok) {
        localStorage.setItem('token', data.token);
        setToken(data.token);
        setUser(data.user);
        setView('dashboard');
      } else {
        alert(data.error || "Échec de l'authentification");
      }
    } catch (e) {
      console.error("Auth error", e);
      alert("Échec de l'authentification : Erreur réseau");
    } finally {
      setIsAuthLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    setView('auth');
  };

  const saveSession = async () => {
    try {
      await fetch('/api/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          title: lessonPoints[0]?.title || "Session sans titre",
          goal: sessionGoal,
          content: courseContent,
          lesson_points: lessonPoints,
          students: students
        })
      });
      fetchSessions();
    } catch (e) { console.error(e); }
  };

  const loadSession = (session: SavedSession) => {
    setLessonPoints(session.lesson_points);
    setStudents(session.students);
    setSessionGoal(session.goal);
    setCourseContent(session.content);
    setView('setup');
  };

  const deleteSession = async (id: number) => {
    try {
      await fetch(`/api/sessions/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      fetchSessions();
      setSessionToDelete(null);
    } catch (e) { console.error(e); }
  };

  // --- Handlers ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type === 'text/plain') {
      const text = await file.text();
      // Wrap in <p> for WYSIWYG
      const formattedText = text.split('\n').map(line => `<p>${line}</p>`).join('');
      setCourseContent(formattedText);
    } else if (file.type === 'application/pdf') {
      setCourseContent("<p>Contenu PDF téléchargé. (L'extraction de texte se ferait ici)</p>");
    }
  };

  const addStudent = () => {
    if (!studentInput.trim()) return;
    const names = studentInput.split(/[\n,]/).map(n => n.trim()).filter(n => n);
    const newStudents = names.map(name => ({ id: Math.random().toString(36).substr(2, 9), name }));
    setStudents([...students, ...newStudents]);
    setStudentInput("");
  };

  const removeStudent = (id: string) => {
    setStudents(students.filter(s => s.id !== id));
  };

  const addLessonPoint = () => {
    setLessonPoints([...lessonPoints, { id: Date.now().toString(), title: 'Nouveau Point', duration: 10 }]);
  };

  const updateLessonPoint = (id: string, updates: Partial<LessonPoint>) => {
    setLessonPoints(lessonPoints.map(p => p.id === id ? { ...p, ...updates } : p));
  };

  const removeLessonPoint = (id: string) => {
    setLessonPoints(lessonPoints.filter(p => p.id !== id));
  };

  const moveLessonPoint = (id: string, direction: 'up' | 'down') => {
    const index = lessonPoints.findIndex(p => p.id === id);
    if (direction === 'up' && index > 0) {
      const newPoints = [...lessonPoints];
      [newPoints[index - 1], newPoints[index]] = [newPoints[index], newPoints[index - 1]];
      setLessonPoints(newPoints);
    } else if (direction === 'down' && index < lessonPoints.length - 1) {
      const newPoints = [...lessonPoints];
      [newPoints[index + 1], newPoints[index]] = [newPoints[index], newPoints[index + 1]];
      setLessonPoints(newPoints);
    }
  };

  const adjustTimer = (seconds: number) => {
    setTimeLeft(prev => Math.max(0, prev + seconds));
  };

  const startClass = () => {
    if (lessonPoints.length === 0) return;
    saveSession();
    setView('active');
    setCurrentPointIndex(0);
    setIsActive(true);
  };

  const formatTime = (seconds: number) => {
    const absSec = Math.abs(seconds);
    const mins = Math.floor(absSec / 60);
    const secs = absSec % 60;
    return `${seconds < 0 ? '-' : ''}${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleAiFocus = async (point: LessonPoint) => {
    setIsAiLoading(true);
    setAiResponse(null);
    const prompt = `Fournis un résumé concis et les points d'enseignement clés pour le segment de leçon intitulé : "${point.title}". Concentre-toi sur la manière d'expliquer cela efficacement aux étudiants. Réponds en français.`;
    const response = await getGeminiResponse(prompt, courseContent);
    setAiResponse(response);
    setIsAiLoading(false);
  };

  const pickStudent = async () => {
    if (students.length === 0 || isPicking) return;

    setIsPicking(true);
    setAiResponse(null);

    // Reset picked list if everyone has been picked
    let availableStudents = students.filter(s => !pickedStudents.includes(s.id));
    if (availableStudents.length === 0) {
      setPickedStudents([]);
      availableStudents = students;
    }

    // Simplified Animation effect
    let count = 0;
    const maxCount = 15; // Shorter animation

    const runAnimation = () => {
      setTimeout(() => {
        const randomIndex = Math.floor(Math.random() * availableStudents.length);
        setSelectedStudent(availableStudents[randomIndex]);
        count++;

        if (count < maxCount) {
          runAnimation();
        } else {
          const finalStudent = availableStudents[Math.floor(Math.random() * availableStudents.length)];
          setSelectedStudent(finalStudent);
          setPickedStudents(prev => [...prev, finalStudent.id]);

          // Faster transition to question
          setTimeout(() => {
            setIsPicking(false);
            generateFlashQuestion(finalStudent);
          }, 1000);
        }
      }, 80); // Constant faster delay
    };

    runAnimation();
  };

  const generateFlashQuestion = async (student: Student) => {
    setIsAiLoading(true);
    const currentPoint = lessonPoints[currentPointIndex];
    const prompt = `Génère une question de compréhension rapide et stimulante pour ${student.name} basée sur le sujet actuel de la leçon : "${currentPoint.title}". La question doit tester sa compréhension du matériel couvert jusqu'à présent. Réponds en français.`;
    const response = await getGeminiResponse(prompt, courseContent);
    setAiResponse(response);
    setIsAiLoading(false);
  };

  // --- UI Components ---
  // Using Context to prevent re-renders causing focus loss on inputs

  const Tour = useMemo(() => () => {
    if (!showTour) return null;
    const step = tourSteps[tourStep];
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] pointer-events-auto" onClick={() => setShowTour(false)} />
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className={cn(
            "relative w-full max-w-sm p-6 rounded-2xl shadow-2xl border pointer-events-auto",
            theme === 'dark' ? "bg-zinc-900 border-zinc-800" : "bg-white border-zinc-200"
          )}
        >
          <div className="flex items-center gap-2 mb-4">
            <Info className="w-5 h-5 text-emerald-500" />
            <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">Guide Interactif</span>
          </div>
          <p className="text-sm mb-6 leading-relaxed">{step.content}</p>
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500">{tourStep + 1} / {tourSteps.length}</span>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setShowTour(false)}>Passer</Button>
              <Button onClick={() => {
                if (tourStep < tourSteps.length - 1) setTourStep(tourStep + 1);
                else setShowTour(false);
              }}>
                {tourStep === tourSteps.length - 1 ? "Terminer" : "Suivant"}
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }, [showTour, tourStep, tourSteps, theme]);

  const StudentPickerOverlay = useMemo(() => () => {
    return (
      <AnimatePresence>
        {isPicking && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-md"
          >
            <div className={cn(
              "p-12 rounded-3xl shadow-2xl border text-center max-w-md w-full mx-4 relative",
              theme === 'dark' ? "bg-zinc-900 border-zinc-800" : "bg-white border-zinc-200"
            )}>
              <div className="mb-8">
                <div className="w-20 h-20 bg-emerald-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <Users className="w-10 h-10 text-emerald-500" />
                </div>
                <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">SÉLECTION ALÉATOIRE</h2>
                <p className="text-sm text-zinc-400">Qui sera le prochain ?</p>
              </div>

              <div className="h-24 flex items-center justify-center overflow-hidden bg-zinc-500/5 rounded-2xl border border-zinc-500/10">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={selectedStudent?.id}
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -20, opacity: 0 }}
                    transition={{ duration: 0.1 }}
                    className="text-3xl font-bold text-emerald-500"
                  >
                    {selectedStudent?.name}
                  </motion.div>
                </AnimatePresence>
              </div>

              <div className="mt-8 flex justify-center gap-2">
                {Array(3).fill(0).map((_, i) => (
                  <motion.div
                    key={i}
                    animate={{ opacity: [0.2, 1, 0.2] }}
                    transition={{ repeat: Infinity, duration: 1, delay: i * 0.2 }}
                    className="w-2 h-2 rounded-full bg-emerald-500"
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }, [isPicking, selectedStudent, theme]);

  const DeleteConfirmationOverlay = useMemo(() => () => {
    const session = savedSessions.find(s => s.id === sessionToDelete);
    return (
      <AnimatePresence>
        {sessionToDelete !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-md p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className={cn(
                "relative w-full max-w-md rounded-3xl p-8 shadow-2xl border overflow-hidden",
                theme === 'dark' ? "bg-zinc-900 border-zinc-800" : "bg-white border-zinc-200"
              )}
            >
              <div className="flex items-center gap-4 mb-8">
                <div className="w-14 h-14 bg-red-500/10 rounded-2xl flex items-center justify-center shrink-0">
                  <AlertCircle className="w-8 h-8 text-red-500" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">Supprimer la session ?</h2>
                  <p className="text-zinc-500 text-sm">Cette action est irréversible.</p>
                </div>
              </div>

              <div className={cn(
                "p-4 rounded-2xl mb-8 border",
                theme === 'dark' ? "bg-zinc-950 border-zinc-800" : "bg-zinc-50 border-zinc-200"
              )}>
                <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Session à supprimer</p>
                <p className="text-sm font-medium italic">"{session?.title || 'Sans titre'}"</p>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  onClick={() => setSessionToDelete(null)}
                  className="flex-1 py-4"
                >
                  Annuler
                </Button>
                <Button
                  variant="danger"
                  onClick={() => deleteSession(sessionToDelete!)}
                  className="flex-1 py-4"
                >
                  Supprimer
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }, [sessionToDelete, savedSessions, theme]);

  return (
    <ThemeContext.Provider value={{ theme }}>
      <div className={cn(
        "min-h-screen font-sans transition-colors duration-500 selection:bg-emerald-500/30 flex flex-col",
        theme === 'dark' ? "bg-black text-zinc-100" : "bg-zinc-50 text-zinc-900"
      )}>
        <Tour />
        <StudentPickerOverlay />
        <DeleteConfirmationOverlay />
        {/* Background Gradients */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className={cn(
            "absolute -top-[10%] -left-[10%] w-[40%] h-[40%] blur-[120px] rounded-full transition-opacity duration-1000",
            theme === 'dark' ? "bg-emerald-500/10 opacity-100" : "bg-emerald-500/5 opacity-100"
          )} />
          <div className={cn(
            "absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] blur-[120px] rounded-full transition-opacity duration-1000",
            theme === 'dark' ? "bg-blue-500/10 opacity-100" : "bg-blue-500/5 opacity-100"
          )} />
        </div>

        <main className="relative z-10 max-w-7xl mx-auto px-4 py-8">
          {/* Header */}
          <header className="flex flex-col sm:flex-row items-center justify-between gap-6 mb-8 sm:mb-12">
            <div className="flex items-center gap-3" id="header-logo">
              <div className={cn(
                "w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shadow-lg transition-all",
                theme === 'dark' ? "bg-emerald-600 shadow-emerald-900/20" : "bg-emerald-500 shadow-emerald-500/20"
              )}>
                <Sparkles className="text-white w-6 h-6 sm:w-7 sm:h-7" />
              </div>
              <div>
                <h1 className={cn(
                  "text-xl sm:text-2xl font-bold tracking-tight transition-colors",
                  theme === 'dark' ? "text-white" : "text-zinc-900"
                )}>
                  AI Class Master
                </h1>
                <p className="text-zinc-500 text-xs sm:text-sm font-medium">Élevez votre expérience d'enseignement</p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto justify-center sm:justify-end">
              {user && (
                <div className="hidden lg:flex items-center gap-3 mr-2 px-4 py-2 rounded-full bg-zinc-500/5 border border-zinc-500/10">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-500 font-bold text-xs">
                    {user.name.charAt(0)}
                  </div>
                  <span className="text-sm font-medium">{user.name}</span>
                </div>
              )}

              <Button
                variant="secondary"
                onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                className="w-10 h-10 p-0 rounded-xl"
              >
                {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
              </Button>

              {user && (
                <div className="relative">
                  <Button
                    variant="secondary"
                    onClick={() => setShowNotifications(!showNotifications)}
                    className="w-10 h-10 p-0 rounded-xl relative"
                  >
                    <Bell className="w-5 h-5" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                        {unreadCount}
                      </span>
                    )}
                  </Button>

                  <AnimatePresence>
                    {showNotifications && (
                      <>
                        <div
                          className="fixed inset-0 z-40"
                          onClick={() => setShowNotifications(false)}
                        />
                        <motion.div
                          initial={{ opacity: 0, y: 10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 10, scale: 0.95 }}
                          className={cn(
                            "absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl shadow-2xl border z-50 overflow-hidden",
                            theme === 'dark' ? "bg-zinc-900 border-zinc-800" : "bg-white border-zinc-200"
                          )}
                        >
                          <div className="p-4 border-b border-zinc-500/10 flex items-center justify-between bg-zinc-500/5">
                            <h3 className="font-bold text-sm">Notifications</h3>
                            {unreadCount > 0 && (
                              <button
                                onClick={markAllAsRead}
                                className="text-[10px] font-bold text-emerald-500 hover:underline uppercase tracking-wider"
                              >
                                Tout marquer comme lu
                              </button>
                            )}
                          </div>
                          <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
                            {notifications.length > 0 ? (
                              notifications.map((n) => (
                                <div
                                  key={n.id}
                                  className={cn(
                                    "p-4 border-b border-zinc-500/5 last:border-0 transition-colors relative group",
                                    !n.is_read && (theme === 'dark' ? "bg-emerald-500/5" : "bg-emerald-50/50")
                                  )}
                                >
                                  <div className="flex gap-3">
                                    <div className={cn(
                                      "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                                      n.type === 'deadline' ? "bg-orange-500/10 text-orange-500" :
                                        n.type === 'absence' ? "bg-red-500/10 text-red-500" :
                                          n.type === 'message' ? "bg-blue-500/10 text-blue-500" :
                                            "bg-emerald-500/10 text-emerald-500"
                                    )}>
                                      {n.type === 'deadline' ? <Clock className="w-4 h-4" /> :
                                        n.type === 'absence' ? <Users className="w-4 h-4" /> :
                                          n.type === 'message' ? <MessageSquare className="w-4 h-4" /> :
                                            <Sparkles className="w-4 h-4" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center justify-between gap-2 mb-1">
                                        <h4 className={cn(
                                          "text-sm font-bold truncate",
                                          !n.is_read ? (theme === 'dark' ? "text-white" : "text-zinc-900") : "text-zinc-500"
                                        )}>
                                          {n.title}
                                        </h4>
                                        <span className="text-[10px] text-zinc-500 shrink-0">
                                          {new Date(n.created_at).toLocaleDateString()}
                                        </span>
                                      </div>
                                      <p className="text-xs text-zinc-500 line-clamp-2 leading-relaxed">
                                        {n.message}
                                      </p>
                                      {!n.is_read && (
                                        <button
                                          onClick={() => markAsRead(n.id)}
                                          className="mt-2 text-[10px] font-bold text-emerald-500 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                          <Check className="w-3 h-3" />
                                          Marquer comme lu
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="p-12 text-center">
                                <Bell className="w-8 h-8 text-zinc-500 mx-auto mb-3 opacity-20" />
                                <p className="text-sm text-zinc-500">Aucune notification</p>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {user && (
                <Button variant="secondary" onClick={() => setShowTour(true)} className="w-10 h-10 p-0 rounded-xl">
                  <HelpCircle className="w-5 h-5" />
                </Button>
              )}

              {view !== 'auth' && view !== 'dashboard' && (
                <Button variant="secondary" onClick={() => setView('dashboard')} className="px-3 sm:px-4">
                  <LayoutDashboard className="w-4 h-4" />
                  <span className="hidden sm:inline">Tableau de bord</span>
                </Button>
              )}

              {user && (
                <Button variant="ghost" onClick={logout} className="text-red-500 hover:bg-red-500/10 px-3 sm:px-4">
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline">Déconnexion</span>
                </Button>
              )}
            </div>
          </header>

          <AnimatePresence mode="wait">
            {view === 'auth' ? (
              <motion.div
                key="auth"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="max-w-md mx-auto mt-12"
              >
                <Card>
                  <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <LogIn className="w-8 h-8 text-emerald-500" />
                    </div>
                    <h2 className="text-2xl font-bold">{authMode === 'login' ? 'Bon retour' : 'Créer un compte'}</h2>
                    <p className="text-zinc-500 text-sm mt-2">
                      {authMode === 'login' ? 'Connectez-vous pour accéder à votre plateforme' : 'Rejoignez AI Class Master aujourd\'hui'}
                    </p>
                  </div>

                  <form onSubmit={handleAuth} className="space-y-4">
                    {authMode === 'register' && (
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-zinc-500 uppercase">Nom complet</label>
                        <input
                          required
                          type="text"
                          value={authForm.name}
                          onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
                          className={cn(
                            "w-full border rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50",
                            theme === 'dark' ? "bg-zinc-950 border-zinc-800" : "bg-white border-zinc-200"
                          )}
                        />
                      </div>
                    )}
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-zinc-500 uppercase">Adresse e-mail</label>
                      <input
                        required
                        type="email"
                        value={authForm.email}
                        onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                        className={cn(
                          "w-full border rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50",
                          theme === 'dark' ? "bg-zinc-950 border-zinc-800" : "bg-white border-zinc-200"
                        )}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-zinc-500 uppercase">Mot de passe</label>
                      <input
                        required
                        type="password"
                        value={authForm.password}
                        onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                        className={cn(
                          "w-full border rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50",
                          theme === 'dark' ? "bg-zinc-950 border-zinc-800" : "bg-white border-zinc-200"
                        )}
                      />
                    </div>
                    <Button type="submit" disabled={isAuthLoading} className="w-full py-4 mt-4">
                      {isAuthLoading ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        authMode === 'login' ? 'Se connecter' : 'Créer un compte'
                      )}
                    </Button>
                  </form>

                  <div className="mt-6 text-center">
                    <button
                      onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
                      className="text-sm text-emerald-500 hover:underline"
                    >
                      {authMode === 'login' ? "Vous n'avez pas de compte ? S'inscrire" : "Vous avez déjà un compte ? Se connecter"}
                    </button>
                  </div>
                </Card>
              </motion.div>
            ) : view === 'dashboard' ? (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
                    <h2 className="text-2xl sm:text-3xl font-bold">Votre Plateforme</h2>
                    <div className="flex items-center gap-2 bg-zinc-500/5 p-1 rounded-xl border border-zinc-500/10">
                      <button
                        onClick={() => toggleSort('date')}
                        className={cn(
                          "px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-2",
                          sortBy === 'date' ? "bg-emerald-500 text-white shadow-lg" : "text-zinc-500 hover:text-zinc-300"
                        )}
                      >
                        Date {sortBy === 'date' && (sortOrder === 'asc' ? '↑' : '↓')}
                      </button>
                      <button
                        onClick={() => toggleSort('title')}
                        className={cn(
                          "px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-2",
                          sortBy === 'title' ? "bg-emerald-500 text-white shadow-lg" : "text-zinc-500 hover:text-zinc-300"
                        )}
                      >
                        Titre {sortBy === 'title' && (sortOrder === 'asc' ? '↑' : '↓')}
                      </button>
                    </div>
                  </div>
                  <Button className="w-full sm:w-auto" onClick={() => {
                    setLessonPoints([
                      { id: '1', title: 'Introduction', duration: 5, focusTask: 'Accueillir les étudiants et fixer les objectifs' },
                      { id: '2', title: 'Concepts Clés', duration: 15, focusTask: 'Expliquer la théorie principale avec des exemples' },
                      { id: '3', title: 'Exercice Pratique', duration: 20, focusTask: 'Les étudiants travaillent sur la fiche d\'exercices' },
                    ]);
                    setStudents([]);
                    setSessionGoal("Maîtriser les fondamentaux du sujet d'aujourd'hui");
                    setCourseContent("");
                    setView('setup');
                  }}>
                    <Plus className="w-4 h-4" />
                    Nouvelle Session
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {isLoadingSessions ? (
                    Array(3).fill(0).map((_, i) => (
                      <div key={i} className="h-48 rounded-2xl bg-zinc-500/10 animate-pulse" />
                    ))
                  ) : savedSessions.length > 0 ? (
                    sortedSessions.map((session) => (
                      <Card key={session.id} className="group hover:scale-[1.02] transition-transform">
                        <div className="flex justify-between items-start mb-4">
                          <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center">
                            <History className="w-5 h-5 text-emerald-500" />
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); setSessionToDelete(session.id); }}
                            className="p-2 text-zinc-500 hover:text-red-500 transition-colors bg-zinc-500/5 rounded-lg"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <h3 className="font-bold text-lg mb-2 line-clamp-1">{session.title}</h3>
                        <p className="text-sm text-zinc-500 mb-4 line-clamp-2 italic">"{session.goal}"</p>
                        <div className="flex items-center justify-between mt-auto">
                          <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">
                            {new Date(session.created_at).toLocaleDateString()}
                          </span>
                          <Button variant="secondary" onClick={() => loadSession(session)} className="text-xs py-1 px-3">
                            Charger
                          </Button>
                        </div>
                      </Card>
                    ))
                  ) : (
                    <div className="col-span-full py-20 text-center">
                      <div className="w-20 h-20 bg-zinc-500/5 rounded-full flex items-center justify-center mx-auto mb-4">
                        <LayoutDashboard className="w-10 h-10 text-zinc-500" />
                      </div>
                      <h3 className="text-xl font-bold">Aucune session pour le moment</h3>
                      <p className="text-zinc-500 mt-2">Commencez votre première session pour la voir ici.</p>
                    </div>
                  )}
                </div>
              </motion.div>
            ) : view === 'setup' ? (
              <motion.div
                key="setup"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="grid grid-cols-1 lg:grid-cols-2 gap-8"
              >
                {/* Left Column: Content & Students */}
                <div className="space-y-8">
                  <Card className="relative" id="session-goal">
                    <div className="flex items-center gap-2 mb-4">
                      <Sparkles className="w-5 h-5 text-emerald-500" />
                      <h2 className="text-lg font-semibold">Objectif de la Session</h2>
                    </div>
                    <input
                      value={sessionGoal}
                      onChange={(e) => setSessionGoal(e.target.value)}
                      placeholder="Quel est l'objectif principal aujourd'hui ?"
                      className={cn(
                        "w-full border rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-colors",
                        theme === 'dark' ? "bg-zinc-950 border-zinc-800" : "bg-white border-zinc-200"
                      )}
                    />
                  </Card>

                  <Card id="course-content">
                    <div className="flex items-center gap-2 mb-4">
                      <BookOpen className="w-5 h-5 text-emerald-400" />
                      <h2 className="text-lg font-semibold">Contenu du Cours</h2>
                    </div>
                    <div className="space-y-4">
                      <div className={cn(
                        "rounded-xl overflow-hidden border transition-colors",
                        theme === 'dark' ? "bg-zinc-950 border-zinc-800" : "bg-white border-zinc-200"
                      )}>
                        <ReactQuill
                          theme="snow"
                          value={courseContent}
                          onChange={setCourseContent}
                          placeholder="Rédigez ou collez le contenu de votre cours ici..."
                          className={cn(
                            "min-h-[200px]",
                            theme === 'dark' ? "quill-dark" : ""
                          )}
                        />
                      </div>

                      <div className="relative group">
                        <input
                          type="file"
                          onChange={handleFileUpload}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                          accept=".txt,.pdf"
                        />
                        <div className="border-2 border-dashed border-zinc-800 group-hover:border-emerald-500/50 rounded-xl p-4 transition-all flex items-center justify-center gap-3 bg-zinc-900/30">
                          <Upload className="w-5 h-5 text-zinc-500 group-hover:text-emerald-400 transition-colors" />
                          <p className="text-xs text-zinc-400 text-center">
                            Ou téléchargez un fichier (PDF, TXT)
                          </p>
                        </div>
                      </div>
                      {courseContent && (
                        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-2 text-emerald-400 text-sm">
                          <CheckCircle2 className="w-4 h-4" />
                          Contenu chargé et prêt pour l'analyse par l'IA
                        </div>
                      )}
                    </div>
                  </Card>

                  <Card id="student-roster">
                    <div className="flex items-center gap-2 mb-4">
                      <Users className="w-5 h-5 text-blue-400" />
                      <h2 className="text-lg font-semibold">Liste des Étudiants</h2>
                    </div>
                    <div className="space-y-4">
                      <div className="flex gap-2">
                        <textarea
                          value={studentInput}
                          onChange={(e) => setStudentInput(e.target.value)}
                          placeholder="Collez les noms des étudiants (un par ligne ou séparés par des virgules)..."
                          className={cn(
                            "flex-1 border rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 min-h-[100px] resize-none transition-colors",
                            theme === 'dark' ? "bg-zinc-950 border-zinc-800" : "bg-white border-zinc-200"
                          )}
                        />
                      </div>
                      <Button onClick={addStudent} className="w-full">
                        <UserPlus className="w-4 h-4" />
                        Ajouter des Étudiants
                      </Button>

                      <div className="max-h-[200px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                        {students.map((student) => (
                          <div key={student.id} className={cn(
                            "flex items-center justify-between p-2 rounded-lg border transition-colors",
                            theme === 'dark' ? "bg-zinc-900/50 border-zinc-800/50" : "bg-zinc-50 border-zinc-200"
                          )}>
                            <span className="text-sm">{student.name}</span>
                            <button onClick={() => removeStudent(student.id)} className="text-zinc-500 hover:text-red-400 transition-colors">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                        {students.length === 0 && (
                          <p className="text-center text-zinc-400 text-sm py-4 italic">Aucun étudiant ajouté pour le moment</p>
                        )}
                      </div>
                    </div>
                  </Card>
                </div>

                {/* Right Column: Lesson Planner */}
                <div className="space-y-8">
                  <Card className="h-full flex flex-col" id="lesson-planner">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-2">
                        <Clock className="w-5 h-5 text-orange-400" />
                        <h2 className="text-lg font-semibold">Planificateur de Leçon</h2>
                      </div>
                      <button
                        onClick={addLessonPoint}
                        className="p-2 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 rounded-lg transition-colors"
                      >
                        <Zap className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex-1 space-y-4 overflow-y-auto pr-2 custom-scrollbar">
                      {lessonPoints.map((point, index) => (
                        <div key={point.id} className={cn(
                          "group relative border rounded-xl p-4 transition-all",
                          theme === 'dark' ? "bg-zinc-950 border-zinc-800 hover:border-zinc-700" : "bg-white border-zinc-200 hover:border-zinc-300"
                        )}>
                          <div className="flex items-start gap-4">
                            <div className={cn(
                              "w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold transition-colors",
                              theme === 'dark' ? "bg-zinc-900 text-zinc-500" : "bg-zinc-100 text-zinc-400"
                            )}>
                              {index + 1}
                            </div>
                            <div className="flex-1 space-y-3">
                              <input
                                value={point.title}
                                onChange={(e) => updateLessonPoint(point.id, { title: e.target.value })}
                                placeholder="Titre du Point"
                                className="w-full bg-transparent font-medium focus:outline-none"
                              />
                              <input
                                value={point.focusTask || ''}
                                onChange={(e) => updateLessonPoint(point.id, { focusTask: e.target.value })}
                                placeholder="Tâche de Focus (optionnel)"
                                className="w-full bg-transparent text-sm text-zinc-500 focus:outline-none italic"
                              />
                              <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2 text-xs text-zinc-500">
                                  <Clock className="w-3 h-3" />
                                  <input
                                    type="number"
                                    value={point.duration}
                                    onChange={(e) => updateLessonPoint(point.id, { duration: parseInt(e.target.value) || 0 })}
                                    className={cn(
                                      "w-12 rounded px-1 py-0.5 focus:outline-none",
                                      theme === 'dark' ? "bg-zinc-900" : "bg-zinc-100"
                                    )}
                                  />
                                  <span>min</span>
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-col gap-1 transition-opacity">
                              <button onClick={() => moveLessonPoint(point.id, 'up')} className="p-1 hover:text-emerald-500"><ArrowUp className="w-4 h-4" /></button>
                              <button onClick={() => moveLessonPoint(point.id, 'down')} className="p-1 hover:text-emerald-500"><ArrowDown className="w-4 h-4" /></button>
                              <button onClick={() => removeLessonPoint(point.id)} className="p-1 text-red-500/50 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-8" id="start-btn">
                      <Button
                        onClick={startClass}
                        disabled={lessonPoints.length === 0}
                        className="w-full py-6 text-lg"
                      >
                        Démarrer la Session de Classe
                        <ChevronRight className="w-5 h-5" />
                      </Button>
                    </div>
                  </Card>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="active"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={cn(
                  "grid grid-cols-1 gap-8",
                  !isPresentationMode ? "lg:grid-cols-3" : "max-w-4xl mx-auto w-full"
                )}
              >
                {/* Main Timer & Current Point */}
                <div className={cn(
                  "space-y-8",
                  !isPresentationMode ? "lg:col-span-2" : "w-full"
                )}>
                  <Card className="relative overflow-hidden">
                    {/* Presentation Mode Toggle */}
                    <div className="absolute top-4 right-4 z-20">
                      <button
                        onClick={() => setIsPresentationMode(!isPresentationMode)}
                        className={cn(
                          "p-2 rounded-lg transition-all",
                          theme === 'dark' ? "bg-zinc-800/50 hover:bg-zinc-700 text-zinc-400" : "bg-zinc-100 hover:bg-zinc-200 text-zinc-500"
                        )}
                        title={isPresentationMode ? "Quitter le mode présentation" : "Mode présentation"}
                      >
                        {isPresentationMode ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                      </button>
                    </div>

                    {/* Progress Bar Background */}
                    <div className="absolute top-0 left-0 w-full h-1 bg-zinc-800">
                      <motion.div
                        className="h-full bg-emerald-500"
                        initial={{ width: "0%" }}
                        animate={{ width: `${(currentPointIndex / lessonPoints.length) * 100}%` }}
                      />
                    </div>

                    <div className="flex flex-col items-center py-12">
                      <span className="text-zinc-500 text-sm font-bold uppercase tracking-widest mb-2">
                        Segment Actuel
                      </span>
                      <h2 className="text-2xl sm:text-4xl font-bold text-center mb-4 px-4">
                        {lessonPoints[currentPointIndex]?.title}
                      </h2>

                      {lessonPoints[currentPointIndex]?.focusTask && (
                        <div className={cn(
                          "px-4 py-2 rounded-full text-xs sm:text-sm font-medium mb-6 sm:mb-8 flex items-center gap-2 max-w-[90%]",
                          theme === 'dark' ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-500/10 text-emerald-600"
                        )}>
                          <Zap className="w-4 h-4 shrink-0" />
                          <span className="truncate">Focus : {lessonPoints[currentPointIndex].focusTask}</span>
                        </div>
                      )}

                      <motion.div
                        animate={timeLeft < 60 && isActive && !isOvertime ? { scale: [1, 1.05, 1] } : {}}
                        transition={{ repeat: Infinity, duration: 1 }}
                        className={cn(
                          "text-6xl sm:text-8xl font-black tabular-nums tracking-tighter transition-colors duration-500",
                          isOvertime ? "text-red-500" : (timeLeft < 60 ? "text-orange-500" : (theme === 'dark' ? "text-white" : "text-zinc-900"))
                        )}
                      >
                        {formatTime(timeLeft)}
                      </motion.div>

                      <div className="flex items-center gap-3 sm:gap-4 mt-8 sm:mt-10">
                        <div className="flex flex-col items-center gap-1">
                          <Button variant="secondary" onClick={() => adjustTimer(-60)} className="w-10 h-10 p-0 rounded-full">
                            <Minus className="w-4 h-4" />
                          </Button>
                          <span className="text-[10px] text-zinc-500 font-bold">-1m</span>
                        </div>

                        <button
                          onClick={() => setIsActive(!isActive)}
                          className={cn(
                            "w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center hover:scale-110 transition-transform shadow-2xl",
                            theme === 'dark' ? "bg-white text-black" : "bg-zinc-900 text-white"
                          )}
                        >
                          {isActive ? <Pause className="w-8 h-8 sm:w-10 sm:h-10" /> : <Play className="w-8 h-8 sm:w-10 sm:h-10 ml-1" />}
                        </button>

                        <div className="flex flex-col items-center gap-1">
                          <Button variant="secondary" onClick={() => adjustTimer(60)} className="w-10 h-10 p-0 rounded-full">
                            <Plus className="w-4 h-4" />
                          </Button>
                          <span className="text-[10px] text-zinc-500 font-bold">+1m</span>
                        </div>

                        <Button variant="secondary" onClick={() => setTimeLeft(lessonPoints[currentPointIndex].duration * 60)} className="w-10 h-10 sm:w-12 sm:h-12 rounded-full p-0 ml-2 sm:ml-4">
                          <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5" />
                        </Button>
                      </div>
                    </div>

                    <div className="flex justify-between items-center mt-6 sm:mt-8 pt-6 sm:pt-8 border-t border-zinc-200 dark:border-zinc-800">
                      <Button
                        variant="ghost"
                        onClick={() => setCurrentPointIndex(Math.max(0, currentPointIndex - 1))}
                        disabled={currentPointIndex === 0}
                        className="px-2 sm:px-4"
                      >
                        <ChevronRight className="w-5 h-5 rotate-180" />
                        <span className="hidden sm:inline">Précédent</span>
                      </Button>
                      <div className="text-xs sm:text-sm font-medium text-zinc-500">
                        {currentPointIndex + 1} / {lessonPoints.length}
                      </div>
                      <Button
                        variant="ghost"
                        onClick={() => setCurrentPointIndex(Math.min(lessonPoints.length - 1, currentPointIndex + 1))}
                        disabled={currentPointIndex === lessonPoints.length - 1}
                        className="px-2 sm:px-4"
                      >
                        <span className="hidden sm:inline">Suivant</span>
                        <ChevronRight className="w-5 h-5" />
                      </Button>
                    </div>
                  </Card>

                  {!isPresentationMode && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-8">
                      <Card className="flex flex-col items-center justify-center text-center group py-6 sm:py-8" onClick={() => handleAiFocus(lessonPoints[currentPointIndex])}>
                        <div className="w-10 h-10 sm:w-12 sm:h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 transition-transform">
                          <Sparkles className="text-emerald-500 w-5 h-5 sm:w-6 sm:h-6" />
                        </div>
                        <h3 className="font-bold mb-1 text-sm sm:text-base">Focus IA</h3>
                        <p className="text-[10px] sm:text-xs text-zinc-500">Résumer ce segment avec Gemini</p>
                      </Card>

                      <Card className="flex flex-col items-center justify-center text-center group py-6 sm:py-8" onClick={pickStudent}>
                        <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-500/10 rounded-xl flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 transition-transform">
                          <Users className="text-blue-500 w-5 h-5 sm:w-6 sm:h-6" />
                        </div>
                        <h3 className="font-bold mb-1 text-sm sm:text-base">Appel Aléatoire</h3>
                        <div className="flex flex-col items-center">
                          <p className="text-[10px] sm:text-xs text-zinc-500">Choisir un étudiant au hasard</p>
                          <div className="mt-2 flex flex-wrap justify-center gap-1 max-w-[120px]">
                            {students.map((s) => (
                              <div
                                key={s.id}
                                className={cn(
                                  "w-1.5 h-1.5 rounded-full transition-colors",
                                  pickedStudents.includes(s.id) ? "bg-blue-500" : "bg-zinc-300"
                                )}
                              />
                            ))}
                          </div>
                        </div>
                      </Card>
                    </div>
                  )}
                </div>

                {/* Sidebar: Timeline & Status */}
                {!isPresentationMode && (
                  <div className="space-y-8">
                    <Card>
                      <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-widest mb-4">Objectif de la Session</h3>
                      <p className="text-sm font-medium italic">"{sessionGoal}"</p>
                    </Card>

                    <Card className="flex flex-col max-h-[600px]">
                      <div className="flex items-center justify-between mb-6 shrink-0">
                        <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-widest">Chronologie</h3>
                        <div className="flex items-center gap-1 text-xs text-zinc-400">
                          <History className="w-3 h-3" />
                          <span>{pickedStudents.length}/{students.length} choisis</span>
                        </div>
                      </div>
                      <div className="space-y-6 overflow-y-auto pr-2 custom-scrollbar flex-1">
                        {lessonPoints.map((point, index) => (
                          <div key={point.id} className="relative pl-8">
                            {/* Timeline Line */}
                            {index !== lessonPoints.length - 1 && (
                              <div className={cn(
                                "absolute left-[11px] top-6 bottom-[-24px] w-[2px]",
                                theme === 'dark' ? "bg-zinc-800" : "bg-zinc-200"
                              )} />
                            )}

                            {/* Timeline Dot */}
                            <div className={cn(
                              "absolute left-0 top-1.5 w-6 h-6 rounded-full border-4 flex items-center justify-center transition-colors",
                              theme === 'dark' ? "border-black" : "border-white",
                              index === currentPointIndex ? "bg-emerald-500" :
                                index < currentPointIndex ? "bg-zinc-400" : (theme === 'dark' ? "bg-zinc-800" : "bg-zinc-100")
                            )}>
                              {index < currentPointIndex && <CheckCircle2 className="w-3 h-3 text-white" />}
                            </div>

                            <div className={cn(
                              "transition-opacity",
                              index === currentPointIndex ? "opacity-100" : "opacity-40"
                            )}>
                              <h4 className="font-bold text-sm">{point.title}</h4>
                              <p className="text-xs text-zinc-500">{point.duration} minutes</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* AI Response Modal */}
          <AnimatePresence>
            {(aiResponse || isAiLoading || (selectedStudent && !isPicking)) && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => {
                    if (!isAiLoading) {
                      setAiResponse(null);
                      setSelectedStudent(null);
                    }
                  }}
                  className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 20 }}
                  className={cn(
                    "relative w-full max-w-2xl border rounded-3xl overflow-hidden shadow-2xl",
                    theme === 'dark' ? "bg-zinc-900 border-zinc-800" : "bg-white border-zinc-200"
                  )}
                >
                  <div className="p-6 sm:p-8">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 sm:w-10 sm:h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center shrink-0">
                          <Sparkles className="text-emerald-500 w-4 h-4 sm:w-5 sm:h-5" />
                        </div>
                        <h3 className="text-lg sm:text-xl font-bold line-clamp-1">
                          {selectedStudent ? `Question pour ${selectedStudent.name}` : "Aperçus de l'IA"}
                        </h3>
                      </div>
                      <button
                        onClick={() => {
                          setAiResponse(null);
                          setSelectedStudent(null);
                        }}
                        className={cn(
                          "p-2 rounded-full transition-colors",
                          theme === 'dark' ? "hover:bg-zinc-800" : "hover:bg-zinc-100"
                        )}
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    <div className="max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                      {isAiLoading ? (
                        <div className="flex flex-col items-center justify-center py-12 gap-4">
                          <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
                          <p className="text-zinc-400 animate-pulse">Gemini réfléchit...</p>
                        </div>
                      ) : (
                        <div className={cn(
                          "prose max-w-none",
                          theme === 'dark' ? "prose-invert prose-emerald" : "prose-zinc prose-emerald"
                        )}>
                          <ReactMarkdown>{aiResponse || ""}</ReactMarkdown>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className={cn(
                    "p-4 flex justify-end",
                    theme === 'dark' ? "bg-zinc-950" : "bg-zinc-50"
                  )}>
                    <Button
                      onClick={() => {
                        setAiResponse(null);
                        setSelectedStudent(null);
                      }}
                      className="px-8"
                    >
                      Compris
                    </Button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </main>

        <footer className={cn(
          "mt-auto py-8 border-t transition-colors",
          theme === 'dark' ? "bg-zinc-950/50 border-zinc-800" : "bg-white border-zinc-200"
        )}>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
                <Sparkles className="text-white w-5 h-5" />
              </div>
              <span className="font-bold">AI Class Master</span>
            </div>

            <div className="text-xs sm:text-sm text-zinc-500 font-medium text-center sm:text-left">
              Développé par : <span className="text-emerald-500 font-bold">HONONTA Towimè Ulrich Pius</span>
            </div>

            <div className="flex items-center gap-6 text-zinc-400">
              <a href="#" className="hover:text-emerald-500 transition-colors"><Info className="w-5 h-5" /></a>
              <a href="#" className="hover:text-emerald-500 transition-colors"><MessageSquare className="w-5 h-5" /></a>
              <a href="https://github.com/Piushnt/AI-Class-Master" target="_blank" className="hover:text-emerald-500 transition-colors">
                <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" /></svg>
              </a>
            </div>
          </div>
        </footer>

        <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #27272a;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #3f3f46;
        }

        .quill-dark .ql-toolbar {
          background-color: #18181b;
          border-color: #27272a !important;
        }
        .quill-dark .ql-container {
          border-color: #27272a !important;
          background-color: #09090b;
          color: #f4f4f5;
        }
        .quill-dark .ql-stroke {
          stroke: #a1a1aa !important;
        }
        .quill-dark .ql-fill {
          fill: #a1a1aa !important;
        }
        .quill-dark .ql-picker {
          color: #a1a1aa !important;
        }
        .quill-dark .ql-picker-options {
          background-color: #18181b !important;
          border-color: #27272a !important;
        }
      `}</style>
      </div>
    </ThemeContext.Provider>
  );
}
