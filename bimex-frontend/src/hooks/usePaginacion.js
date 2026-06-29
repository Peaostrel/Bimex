import { useState, useEffect } from "react";

const PAGINA_SIZE = 20;

export default function usePaginacion(consultaFn, dependencias = []) {
  const [pagina, setPagina] = useState(0);
  const [datos, setDatos] = useState([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);

  // Resetear a página 0 al cambiar dependencias
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPagina(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencias);

  useEffect(() => {
    let activo = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCargando(true);
    const desde = pagina * PAGINA_SIZE;
    const hasta = desde + PAGINA_SIZE - 1;

    Promise.resolve()
      .then(() => consultaFn(desde, hasta))
      .then(({ data, count }) => {
        if (!activo) return;
        setDatos(data || []);
        setTotal(Number(count || 0));
      })
      .catch(() => {
        if (!activo) return;
        setDatos([]);
        setTotal(0);
      })
      .finally(() => {
        if (!activo) return;
        setCargando(false);
      });

    return () => { activo = false; };
  }, [pagina, ...dependencias]);

  return { datos, total, pagina, setPagina, cargando, totalPaginas: Math.max(1, Math.ceil(total / PAGINA_SIZE)) };
}
