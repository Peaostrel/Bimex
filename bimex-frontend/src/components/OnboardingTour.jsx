import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

const TOUR_STORAGE_KEY = "bimex.tour.completed";

export default function OnboardingTour({ isActive, onComplete }) {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(0);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const tooltipRef = useRef(null);

  const steps = [
    {
      target: ".wallet-chip",
      title: t("tour.step1.title"),
      content: t("tour.step1.content"),
      placement: "bottom",
    },
    {
      target: "#contenido-principal",
      title: t("tour.step2.title"),
      content: t("tour.step2.content"),
      placement: "top",
    },
    {
      target: ".project-card",
      title: t("tour.step3.title"),
      content: t("tour.step3.content"),
      placement: "top",
    },
    {
      target: "[style*='testnetBadge']",
      title: t("tour.step4.title"),
      content: t("tour.step4.content"),
      placement: "bottom",
    },
    {
      target: ".navbar-actions",
      title: t("tour.step5.title"),
      content: t("tour.step5.content"),
      placement: "bottom",
    },
  ];

  useEffect(() => {
    if (!isActive) return;

    const updatePosition = () => {
      const step = steps[currentStep];
      let targetElement = null;
      try {
        targetElement = document.querySelector(step.target);
      } catch { /* selector inválido — se ignora */ }

      if (!targetElement && step.fallback) {
        try {
          targetElement = document.querySelector(step.fallback);
        } catch { /* selector inválido — se ignora */ }
      }

      if (!targetElement) return;

      const rect = targetElement.getBoundingClientRect();
      const tooltipRect = tooltipRef.current?.getBoundingClientRect() || { width: 320, height: 200 };

      let top;
      let left;

      switch (step.placement) {
        case "bottom":
          top = rect.bottom + 16;
          left = rect.left + rect.width / 2 - tooltipRect.width / 2;
          break;
        case "top":
          top = rect.top - tooltipRect.height - 16;
          left = rect.left + rect.width / 2 - tooltipRect.width / 2;
          break;
        case "left":
          top = rect.top + rect.height / 2 - tooltipRect.height / 2;
          left = rect.left - tooltipRect.width - 16;
          break;
        case "right":
          top = rect.top + rect.height / 2 - tooltipRect.height / 2;
          left = rect.right + 16;
          break;
        default:
          top = rect.bottom + 16;
          left = rect.left;
      }

      // Keep tooltip within viewport
      const padding = 16;
      if (left < padding) left = padding;
      if (left + tooltipRect.width > window.innerWidth - padding) {
        left = window.innerWidth - tooltipRect.width - padding;
      }
      if (top < padding) top = padding;

      setTooltipPosition({ top, left });

      // Highlight target element
      targetElement.style.position = "relative";
      targetElement.style.zIndex = "10000";
      targetElement.style.boxShadow = "0 0 0 4px rgba(22, 163, 74, 0.3), 0 0 0 2px var(--green)";
      targetElement.style.borderRadius = "var(--radius-sm)";
      targetElement.style.transition = "all 0.3s ease";

      return () => {
        targetElement.style.position = "";
        targetElement.style.zIndex = "";
        targetElement.style.boxShadow = "";
      };
    };

    const timer = setTimeout(updatePosition, 100);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition);
    };
  }, [isActive, currentStep]);

  const cleanupHighlight = (selector) => {
    try {
      const el = document.querySelector(selector);
      if (el) {
        el.style.position = "";
        el.style.zIndex = "";
        el.style.boxShadow = "";
      }
    } catch { /* selector inválido — se ignora */ }
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      cleanupHighlight(steps[currentStep].target);
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handleSkip = () => {
    handleComplete();
  };

  const handleComplete = () => {
    cleanupHighlight(steps[currentStep].target);
    localStorage.setItem(TOUR_STORAGE_KEY, "true");
    onComplete();
  };

  if (!isActive) return null;

  const step = steps[currentStep];

  return (
    <>
      {/* Overlay */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0, 0, 0, 0.5)",
          zIndex: 9998,
          animation: "fadeIn 0.3s ease",
        }}
        onClick={handleSkip}
      />

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        style={{
          position: "fixed",
          top: tooltipPosition.top,
          left: tooltipPosition.left,
          zIndex: 10001,
          background: "var(--card)",
          border: "2px solid var(--green)",
          borderRadius: "var(--radius)",
          boxShadow: "var(--shadow-lg)",
          padding: "20px 24px",
          maxWidth: 360,
          width: "calc(100vw - 32px)",
          animation: "slideIn 0.3s ease",
        }}
      >
        {/* Progress indicator */}
        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          {steps.map((_, idx) => (
            <div
              key={idx}
              style={{
                flex: 1,
                height: 3,
                background: idx <= currentStep ? "var(--green)" : "var(--border)",
                borderRadius: 99,
                transition: "all 0.3s ease",
              }}
            />
          ))}
        </div>

        {/* Content */}
        <div style={{ marginBottom: 20 }}>
          <h3
            style={{
              fontSize: "1rem",
              fontWeight: 600,
              color: "var(--text)",
              marginBottom: 8,
              lineHeight: 1.4,
            }}
          >
            {step.title}
          </h3>
          <p
            style={{
              fontSize: "0.88rem",
              color: "var(--text2)",
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            {step.content}
          </p>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button
            onClick={handleSkip}
            style={{
              background: "none",
              border: "none",
              color: "var(--muted)",
              fontSize: "0.84rem",
              fontWeight: 500,
              cursor: "pointer",
              padding: "8px 12px",
            }}
          >
            {t("tour.skip")}
          </button>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: "0.78rem", color: "var(--muted)", fontWeight: 500 }}>
              {currentStep + 1} / {steps.length}
            </span>
            <button
              onClick={handleNext}
              className="btn"
              style={{
                background: "var(--green)",
                color: "#fff",
                border: "none",
                padding: "8px 20px",
                borderRadius: "var(--radius-sm)",
                fontSize: "0.84rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {currentStep < steps.length - 1 ? t("tour.next") : t("tour.finish")}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </>
  );
}

