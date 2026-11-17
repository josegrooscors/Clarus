-- 17-nov-2026: José presenta Clarus a una directiva externa; pidió quitar el logo de Viejo Cántaro (Clarus es un proyecto propio, no de la empresa).
-- Solo se quitó el dato; el archivo sigue en app/logos/. Para volver a mostrarlo:
-- update empresas set logo_url = 'logos/b4aeec7e-52fa-4241-a53a-dd71949e6dd0.png' where id = 'b4aeec7e-52fa-4241-a53a-dd71949e6dd0';
update empresas set logo_url = null where id = 'b4aeec7e-52fa-4241-a53a-dd71949e6dd0';
