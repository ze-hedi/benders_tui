import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// jsdom doesn't implement scrollIntoView, which ChatMessages uses for auto-scroll
Element.prototype.scrollIntoView = vi.fn();
