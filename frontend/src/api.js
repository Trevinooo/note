import axios from 'axios';

const DEFAULT_SERVER = 'http://172.20.10.2:3001';
const isNative = typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();

function getServerUrl() {
    return localStorage.getItem('server_url') || DEFAULT_SERVER;
}

function setServerUrl(url) {
    // 自动补全协议和端口
    let u = url.trim();
    if (u && !u.startsWith('http')) u = 'http://' + u;
    if (u && !u.match(/:\d+$/)) u = u + ':3001';
    localStorage.setItem('server_url', u);
    // 动态更新 axios baseURL
    api.defaults.baseURL = isNative ? `${u}/api` : '/api';
    return u;
}

const api = axios.create({
    baseURL: isNative ? `${getServerUrl()}/api` : '/api',
    timeout: 30000,
});

api.interceptors.request.use(config => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

api.interceptors.response.use(
    res => res.data,
    err => {
        if (err.response?.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.hash = '#/login';
        }
        return Promise.reject(err);
    }
);

export default api;

export { getServerUrl, setServerUrl };

export function setAuth(token, user) {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
}

export function getUser() {
    try {
        return JSON.parse(localStorage.getItem('user'));
    } catch {
        return null;
    }
}

export function clearAuth() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
}

export function updateUser(user) {
    localStorage.setItem('user', JSON.stringify(user));
}

export function getToken() {
    return localStorage.getItem('token');
}

export function isLoggedIn() {
    return !!localStorage.getItem('token');
}
