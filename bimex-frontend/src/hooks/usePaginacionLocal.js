import { useState, useMemo, useEffect, useRef } from "react";

const PAGINA_SIZE = 20;

export default function usePaginacionLocal(datos, dependencias = []) {
  const [pagina, setPagina] = useState(0);
  const prevDepRef = useRef(JSON.stringify(dependencias));

  useEffect(() => {
    const key = JSON.stringify(dependencias);
    if (key !== prevDepRef.current) {
      prevDepRef.current = key;
      setPagina(0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencias);

  const total = datos.length;
  const totalPaginas = Math.ceil(total / PAGINA_SIZE);

  const datosPagina = useMemo(() => {
    const desde = pagina * PAGINA_SIZE;
    return datos.slice(desde, desde + PAGINA_SIZE);
  }, [datos, pagina]);

  // Derived state during render: clamp page when data shrinks
  if (totalPaginas > 0 && pagina >= totalPaginas) {
    setPagina(Math.max(0, totalPaginas - 1));
  }

  return { datosPagina, pagina, setPagina, totalPaginas, total };
}

export { PAGINA_SIZE };
