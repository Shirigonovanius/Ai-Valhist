import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://obaprtjphepgkgcgpmii.supabase.co'; 

// ВОТ СЮДА ВСТАВЬ ДЛИННЫЙ КЛЮЧ, КОТОРЫЙ НАЧИНАЕТСЯ НА "ey..."
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9iYXBydGpwaGVwZ2tnY2dwbWlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzMzE4NjIsImV4cCI6MjA4MTkwNzg2Mn0.8v8oMMKAkAlKkLrUgViSO09BKUZlOdqOP0AcRj1SsjA';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);