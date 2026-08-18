import { mount } from 'svelte';
import App from './App.svelte';
import './lib/layout.css';

mount(App, { target: document.getElementById('app')! });
