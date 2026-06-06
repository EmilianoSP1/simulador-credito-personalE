# Simulador de Crédito Personal · Nimbo

Cotizador web de crédito personal basado en **amortización constante** (pago a capital fijo),
con **interés ordinario sobre saldo insoluto**, **IVA del 16 %** sobre los intereses y
**comisión por apertura** opcional. Incluye tabla de amortización, gráfica de evolución del
crédito y un resumen de totales.

Proyecto de la asignatura *Desarrollo Web Integral* — práctica de control de versiones y
modelado de procesos web.

## Modelo financiero

Para cada mes `k`:

```
pago a capital   = total a financiar / plazo            (fijo)
interés del mes  = saldo insoluto × (tasa anual / 12)   (decrece)
IVA del mes      = interés del mes × 0.16
pago mensual     = pago a capital + interés + IVA        (decrece)
saldo insoluto  -= pago a capital
```

La comisión por apertura (si se activa) se calcula como `monto × % × 1.16` y se suma al
capital para formar el **total a financiar**. El **CAT aproximado** se obtiene por TIR de los
flujos mensuales, anualizada de forma compuesta (valor informativo).

## Estructura

```
simulador-credito-personal/
├── index.html      Estructura e interfaz de captura
├── styles.css      Diseño minimalista (responsivo)
├── script.js       Lógica financiera, render de tabla y gráfica
└── README.md
```

No requiere dependencias locales: la gráfica usa Chart.js vía CDN.

## Uso local

Abre `index.html` en el navegador, o levanta un servidor estático:

```bash
python -m http.server 5500
# visita http://localhost:5500
```

## Control de versiones (Conventional Commits)

```bash
git init
git add index.html
git commit -m "feat: estructura de interfaz HTML para captura de parametros crediticios"
git add styles.css
git commit -m "style: maquetacion responsiva y diseno visual institucional"
git add script.js
git commit -m "feat: algoritmo de amortizacion constante, saldos insolutos e IVA"
git add README.md .gitignore
git commit -m "docs: documentacion del proyecto y configuracion de git"
```

## Despliegue

```bash
git remote add origin https://github.com/USUARIO/simulador-credito-personal.git
git branch -M main
git push -u origin main
```

Luego en GitHub: **Settings → Pages → Source: rama `main` / raíz → Save**.
Alternativas de producción: Vercel o Netlify (importar el repositorio y desplegar).

---

> Cifras estimadas con fines de simulación. La tasa final se otorga con base en evaluación crediticia.
