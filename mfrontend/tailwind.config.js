export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: { extend: {
    colors: { ink: '#0E1B2B', paper: '#EDF0F3', mist: '#E3E8ED', line: '#D3DAE1',
      brand: { DEFAULT: '#0B6E4F', dark: '#08543D' }, amber: '#B7791F', danger: '#B42318',
      // Sidebar palette (deep navy, with a lighter blue for the active item)
      // SIMS-style chrome (header, sidebar, navbar, dashboard cards)
      mn: { DEFAULT: '#12305a', dark: '#0c2447', soft: '#e6edf7', navy: '#1c3f73', sky: '#4f86c6', link: '#337ab7', text: '#676a6c', bg: '#f3f3f4' },
      navy: { 900: '#0a2442', 800: '#0c2f55', 600: '#17487f', 500: '#235ca0' } },
    fontFamily: {
      sans: ['"Public Sans"', 'system-ui', 'sans-serif'],
      // Used by the sidebar and header
      ui: ['"Open Sans"', '"Helvetica Neue"', 'Arial', 'sans-serif'],
      serif: ['Georgia', '"Times New Roman"', 'serif'],
    },
  } },
};