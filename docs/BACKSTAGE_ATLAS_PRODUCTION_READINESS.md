# BACKSTAGE · preparación de MongoDB Atlas

25 de octubre de 2026, Bogotá. Estado: **preparación productiva no acreditada**. [Auditoría real de solo lectura](evidence/automation-atlas-readiness.json).

| Clasificación | Resultado |
| --- | --- |
| Implementado | Base nueva exclusiva del ensayo; identidad empresarial de servicio analyst con una sola organización; once colecciones y veintinueve índices. |
| Probado | TLS activo, MongoDB 8.0.34, namespace separado, auditoría íntegra, restauración aislada de sus datos e imposibilidad de acceder por API a otra organización. |
| Pendiente | Atlas productivo separado, usuario de base con privilegios mínimos, restricciones de red, tier, retención, respaldo programado y custodia externa. |
| Bloqueado | Administración Atlas: el propietario indicó que conectará su cuenta, pero la conexión administrativa no está confirmada. |

La base `backstage_auto_1315eafd` comparte el clúster de pruebas. Separar nombres de base no demuestra clústeres separados. La credencial MongoDB disponible tiene un rol amplio: `least_privilege_verified=false`. El rol analyst de la aplicación no reduce los privilegios de esa credencial frente a Atlas.

No se ha verificado mediante API administrativa el nivel contratado, la lista de acceso IP, la configuración de cifrado en reposo ni la política administrada de backups/PITR. La conexión de datos no concede facultades para certificar ni modificar esos controles. No se cambiaron usuarios administrados, reglas de red, plan, pagos ni datos productivos.

Tras conectar Atlas corresponde inventariar proyecto y clúster; acordar separación productiva; crear una identidad de runtime limitada a su base y permisos efectivamente requeridos; separar inicialización de índices de ejecución; restringir red con una estrategia compatible con los egresos Vercel; rotar la credencial amplia fuera del runtime; y comprobar fallos de acceso fuera de alcance. La selección exacta del rol y de los índices debe validarse contra las transacciones existentes, sin conceder privilegios administrativos por conveniencia.

Luego debe configurarse el respaldo compatible con el tier real, retención, destino y custodia de claves fuera del PC, con restauración de prueba. Cualquier costo nuevo requiere autorización. El respaldo lógico del ensayo ya restaurado no verifica un respaldo administrado ni un RPO productivo. [Restauración medida](BACKSTAGE_RESTORE_TEST_REPORT.md).
