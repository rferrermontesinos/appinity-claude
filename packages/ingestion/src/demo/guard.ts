/** El seed de demo solo existe fuera de producción y con DEMO_MODE=true. */
export function assertDemoSeedAllowed(): void {
  if (process.env.NODE_ENV === 'production') throw new Error('El seed de demo está prohibido en producción');
  if (process.env.DEMO_MODE !== 'true' && process.env.NODE_ENV !== 'test') {
    throw new Error('El seed de demo requiere DEMO_MODE=true');
  }
}
