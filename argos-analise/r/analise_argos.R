# ARGOS GeoVigilância · Grupo 4 · análise em R (tidyverse)
#
# Reproduz em R as principais tabelas de análise (por ciclo, por DS, por faixa de distância,
# dentro × fora do raio, associação distância × IDV) e gera 12 gráficos com ggplot2
# (g1 a g9 em barras e linha; g3, g10, g11 e g12 são mapas de calor).
#
# Como rodar (a partir da pasta do projeto, a que tem a pasta "tabelas"):
#   install.packages("tidyverse")        # só na primeira vez
#   Rscript r/analise_argos.R            # ou abra no RStudio com a pasta do projeto como diretório de trabalho
#
# Regras (Nota Técnica nº 3/2025): A = armadilha examinada, P = positiva (ovos > 0), O = ovos
#   IPO = P/A*100    IDO = O/P    IDV = O/A      (soma A, P, O no grupo e só depois divide)
# Os valores esperados (calculados em Python a partir dos mesmos CSVs) estão nos comentários "# esperado".

library(tidyverse)   # readr, dplyr, tidyr, ggplot2

dir.create("graficos_r", showWarnings = FALSE)

# ---- 1. leitura -------------------------------------------------------------
# read_csv (readr) lê UTF-8 por padrão: os acentos e o traço "–" das faixas chegam certos, inclusive no Windows
fato    <- read_csv("tabelas/fato_leitura.csv", show_col_types = FALSE)   # 1 linha por OVT e ciclo
dim_ovt <- read_csv("tabelas/dim_ovt.csv",      show_col_types = FALSE)   # 1 linha por OVT
dim_edl <- read_csv("tabelas/dim_edl.csv",      show_col_types = FALSE)   # 1 linha por local de EDL

ordem_ds <- c("I", "II", "III", "IV", "V", "VI", "VII", "VIII")
faixas   <- c("0–100 m", "100–200 m", "200–300 m", "300–400 m",
              "400–600 m", "600–1.000 m", "acima de 1.000 m")

fato <- fato %>%
  mutate(ds         = factor(ds, levels = ordem_ds),
         faixa_dist = factor(faixa_dist, levels = faixas, ordered = TRUE))

glimpse(fato)

# autoverificação: se algum destes falhar, os CSVs não são os esperados
stopifnot(nrow(fato) == 31455,       # leituras
          sum(fato$A) == 30473,      # armadilhas examinadas
          sum(fato$O) == 6109375,    # ovos (inclui 1.011 leituras preenchidas pela média do bairro)
          nrow(dim_ovt) == 2871,     # OVTs
          nrow(dim_edl) == 378)      # locais de EDL

# ---- 2. função dos indicadores ----------------------------------------------
# soma A, P, O dentro de cada grupo e só então divide; denominador zero vira NA ("não calculável")
indicadores <- function(df, ...) {
  df %>%
    group_by(...) %>%
    summarise(A = sum(A), P = sum(P), O = sum(O), .groups = "drop") %>%
    mutate(IPO = if_else(A > 0, 100 * P / A, NA_real_),
           IDO = if_else(P > 0, O / P,       NA_real_),
           IDV = if_else(A > 0, O / A,       NA_real_))
}

# ---- 3. tabelas de análise --------------------------------------------------
# Recife inteiro
indicadores(fato)
# esperado: A 30473 · P 29977 · O 6109375 · IPO 98.37 · IDO 203.80 · IDV 200.48

# T02 · por ciclo
t02 <- indicadores(fato, ciclo)
print(t02)
# esperado (IDV): 158.69 191.72 205.55 246.47 246.55 150.93 230.67 180.23 176.44 210.22 220.16 186.09

# T03 · por distrito sanitário
t03 <- indicadores(fato, ds)
print(t03)

# T04 · DS × ciclo (formato longo, pronto para o gráfico)
t04 <- indicadores(fato, ds, ciclo)

# leituras de OVTs com coordenada válida (para as análises de distância)
ok <- fato %>% filter(!is.na(dist_m))

# T06 · por faixa de distância até a EDL mais próxima
t06 <- indicadores(ok, faixa_dist) %>%
  mutate(amostra = if_else(A < 300, "pequena (< 300 armadilhas)", "ok"))
print(t06)
# esperado (IDV): 213.66 206.64 209.59 194.52 198.28 173.86 153.50

# T07 · dentro × fora do raio (300 m e 400 m)
t07 <- bind_rows(
  indicadores(ok, grupo = grupo_300m) %>% mutate(raio_m = 300),
  indicadores(ok, grupo = grupo_400m) %>% mutate(raio_m = 400)
)
print(t07)
# esperado 400 m: dentro A 21959 · IDV 205.23 | fora A 8514 · IDV 188.24
# esperado 300 m: dentro A 16042 · IDV 209.2  | fora A 14431 · IDV 190.8

# T07 por DS (400 m)
t07_ds <- indicadores(ok, ds, grupo_400m) %>%
  group_by(ds) %>%
  mutate(ds_rotulo = if_else(min(A) < 300, paste0(ds, "*"), as.character(ds))) %>%   # * = um lado com < 300 armadilhas
  ungroup() %>%
  mutate(ds_rotulo = factor(ds_rotulo, levels = unique(ds_rotulo)))
# esperado: DS I a 400 m tem só 283 armadilhas fora do raio (IDV 216 contra 163 dentro): amostra pequena

# T10 · associação entre a distância à EDL e o IDV de cada OVT (correlação de Spearman)
por_ovt <- ok %>%
  group_by(id_ovt) %>%
  summarise(A = sum(A), O = sum(O), dist_m = first(dist_m), .groups = "drop") %>%
  filter(A > 0) %>%
  mutate(IDV = O / A)
cor.test(por_ovt$dist_m, por_ovt$IDV, method = "spearman", exact = FALSE)
# esperado: rho = -0.0813 (n = 2868). Associação desprezível: não indica eficácia nem causa.

# ---- 4. gráficos (ggplot2) --------------------------------------------------
azul <- "#1F3A5F"; laranja <- "#D9822B"; cinza <- "#6B7280"
tema <- theme_minimal(base_size = 11) +
  theme(plot.title = element_text(face = "bold"), panel.grid.minor = element_blank())

# g1 · IDV por ciclo
g1 <- ggplot(t02, aes(ciclo, IDV)) +
  geom_line(color = azul) + geom_point(color = azul, size = 2) +
  geom_text(aes(label = round(IDV)), vjust = -1, size = 3, color = cinza) +
  scale_x_continuous(breaks = 1:12) +
  labs(title = "IDV por ciclo, Recife", x = "ciclo (15 dias) · 2026", y = "IDV (ovos por armadilha)") + tema
ggsave("graficos_r/g1_idv_por_ciclo.png", g1, width = 8, height = 3.8, dpi = 150)

# g2 · IDV por faixa de distância (laranja = amostra pequena)
g2 <- ggplot(t06, aes(faixa_dist, IDV, fill = amostra)) +
  geom_col() +
  geom_text(aes(label = round(IDV), y = IDV - 18), vjust = 1, size = 3, color = "white", fontface = "bold") +
  geom_vline(xintercept = 4.5, color = cinza) +                       # limite de 400 m
  geom_hline(yintercept = sum(ok$O) / sum(ok$A), linetype = "dashed", color = cinza) +
  scale_fill_manual(values = c("ok" = azul, "pequena (< 300 armadilhas)" = laranja), name = NULL) +
  labs(title = "IDV por distância até a EDL mais próxima", x = NULL, y = "IDV (ovos por armadilha)",
       caption = "linha tracejada = IDV do conjunto · linha vertical = limite de 400 m") +
  tema + theme(axis.text.x = element_text(angle = 20, hjust = 1), legend.position = "top")
ggsave("graficos_r/g2_idv_por_faixa.png", g2, width = 8, height = 3.8, dpi = 150)

# g3 · mapa de calor DS × ciclo
g3 <- ggplot(t04, aes(factor(ciclo), fct_rev(ds), fill = IDV)) +
  geom_tile() +
  geom_text(aes(label = round(IDV)), size = 2.8) +
  scale_fill_gradient(low = "#FFF7E0", high = "#B7410E") +
  labs(title = "IDV por distrito sanitário e ciclo", x = "ciclo", y = "distrito sanitário") + tema
ggsave("graficos_r/g3_idv_ds_x_ciclo.png", g3, width = 8, height = 3.9, dpi = 150)

# g4 · dentro × fora de 400 m, por DS (associação, não eficácia)
g4 <- ggplot(t07_ds, aes(ds_rotulo, IDV, fill = grupo_400m)) +
  geom_col(position = "dodge") +
  scale_fill_manual(values = c("dentro de 400 m" = azul, "fora de 400 m" = laranja), name = NULL) +
  labs(title = "IDV dentro × fora do raio de 400 m (associação, não eficácia)", x = "distrito sanitário", y = "IDV",
       caption = "* um dos lados com menos de 300 armadilhas examinadas: leia com cautela") +
  tema + theme(legend.position = "top")
ggsave("graficos_r/g4_dentro_fora_por_ds.png", g4, width = 8, height = 3.8, dpi = 150)

# ---- 5. mais gráficos: barras (g5 a g9) e mapas de calor (g10 a g12) --------
idv_geral <- sum(fato$O) / sum(fato$A)          # esperado: 200.48
ler_tab  <- function(nome) read_csv(file.path("tabelas", nome), show_col_types = FALSE)

# g5 · IDV por distrito sanitário
g5 <- ggplot(t03, aes(ds, IDV)) +
  geom_col(fill = azul) +
  geom_hline(yintercept = idv_geral, linetype = "dashed", color = cinza) +
  geom_text(aes(label = round(IDV), y = IDV - 10), vjust = 1, size = 3, color = "white", fontface = "bold") +
  labs(title = "IDV por distrito sanitário, ciclos 1 a 12", x = "distrito sanitário", y = "IDV (ovos por armadilha)",
       caption = paste0("linha tracejada = IDV do Recife (", round(idv_geral), ")")) + tema
ggsave("graficos_r/g5_idv_por_ds.png", g5, width = 8, height = 3.8, dpi = 150)

# g6 · bairros com maior e menor IDV (só amostra adequada, >= 300 armadilhas)
t05 <- ler_tab("t05_por_bairro.csv") %>% filter(amostra == "ok") %>% arrange(desc(IDV))
extremos <- bind_rows(slice_head(t05, n = 10), slice_tail(t05, n = 10)) %>%
  distinct(bairro, .keep_all = TRUE) %>%
  mutate(rotulo = paste0(str_to_title(bairro), " (", ds, ")"),
         acima  = if_else(IDV >= idv_geral, "acima do Recife", "abaixo do Recife"))
g6 <- ggplot(extremos, aes(IDV, fct_reorder(rotulo, IDV), fill = acima)) +
  geom_col() +
  geom_vline(xintercept = idv_geral, linetype = "dashed", color = cinza) +
  geom_text(aes(label = round(IDV)), hjust = -0.2, size = 3) +
  scale_fill_manual(values = c("acima do Recife" = azul, "abaixo do Recife" = laranja), name = NULL) +
  scale_x_continuous(expand = expansion(mult = c(0, 0.1))) +
  labs(title = paste0("Bairros com maior e menor IDV (só os ", nrow(t05), " com ≥ 300 armadilhas)"),
       x = "IDV (ovos por armadilha)", y = NULL, caption = "10 maiores e 10 menores · (DS) ao lado do bairro") +
  tema + theme(legend.position = "top")
ggsave("graficos_r/g6_bairros_maior_menor_idv.png", g6, width = 8, height = 6.2, dpi = 150)

# g7 · diferença de IDV dentro − fora de 400 m, por DS (associação, não eficácia)
t07c <- ler_tab("t07_dentro_fora_raio.csv") %>%
  filter(raio_m == 400) %>%
  mutate(rotulo = if_else(amostra != "ok", paste0(ds, "*"), ds),
         sinal  = if_else(IDV_dif >= 0, "maior dentro do raio", "menor dentro do raio"))
t07c$rotulo <- factor(t07c$rotulo, levels = t07c$rotulo)      # mantém a ordem: Todos, I ... VIII
g7 <- ggplot(t07c, aes(rotulo, IDV_dif, fill = sinal)) +
  geom_col() +
  geom_hline(yintercept = 0, color = cinza) +
  geom_text(aes(label = sprintf("%+.0f", IDV_dif), vjust = if_else(IDV_dif >= 0, -0.5, 1.5)), size = 3) +
  scale_fill_manual(values = c("maior dentro do raio" = azul, "menor dentro do raio" = laranja), name = NULL) +
  scale_y_continuous(expand = expansion(mult = 0.15)) +
  labs(title = "Diferença de IDV, dentro − fora de 400 m (associação, não eficácia)", x = NULL, y = "IDV dentro − IDV fora",
       caption = "* um dos lados com menos de 300 armadilhas examinadas") +
  tema + theme(legend.position = "top")
ggsave("graficos_r/g7_diferenca_dentro_fora_ds.png", g7, width = 8, height = 3.8, dpi = 150)

# g8 · antes × depois da instalação da EDL mais próxima
t12 <- ler_tab("t12_antes_depois.csv") %>%
  mutate(grupo = factor(paste0(grupo, "\n(n = ", n_ovts, " OVTs)"), levels = unique(paste0(grupo, "\n(n = ", n_ovts, " OVTs)")))) %>%
  pivot_longer(c(IDV_antes, IDV_depois), names_to = "momento", values_to = "IDV_mom") %>%
  mutate(momento = recode(momento, IDV_antes = "antes da instalação", IDV_depois = "depois da instalação"))
g8 <- ggplot(t12, aes(grupo, IDV_mom, fill = momento)) +
  geom_col(position = position_dodge(width = 0.8), width = 0.75) +
  geom_text(aes(label = round(IDV_mom)), position = position_dodge(width = 0.8), vjust = -0.5, size = 3) +
  scale_fill_manual(values = c("antes da instalação" = cinza, "depois da instalação" = azul), name = NULL) +
  scale_y_continuous(expand = expansion(mult = c(0, 0.12))) +
  labs(title = "IDV antes × depois da instalação da EDL mais próxima", x = NULL, y = "IDV",
       caption = "só locais com data de instalação · a diferença é pequena e não separa efeito da EDL de sazonalidade") +
  tema + theme(legend.position = "top")
ggsave("graficos_r/g8_antes_depois.png", g8, width = 8, height = 3.8, dpi = 150)

# g9 · % de leituras sem resultado por ciclo (F, E, R, D e REC)
t09 <- ler_tab("t09_situacao_coleta.csv")
g9 <- ggplot(t09, aes(ciclo, pct_sem_resultado)) +
  geom_col(fill = azul) +
  geom_text(aes(label = sprintf("%.1f", pct_sem_resultado)), vjust = -0.5, size = 3) +
  scale_x_continuous(breaks = 1:12) +
  scale_y_continuous(expand = expansion(mult = c(0, 0.12))) +
  labs(title = "Leituras sem resultado por ciclo (F, E, R, D e REC)", x = "ciclo (15 dias) · 2026", y = "% de leituras sem resultado") + tema
ggsave("graficos_r/g9_sem_resultado_por_ciclo.png", g9, width = 8, height = 3.6, dpi = 150)

# mapa de calor genérico: texto em itálico com * quando a célula tem poucas armadilhas
mapa_calor <- function(dados, x, y, minimo, titulo, xlab, ylab, nota, tam = 2.8) {
  dados <- dados %>% mutate(pouca = A < minimo,
                            txt = paste0(round(IDV), if_else(pouca, "*", "")),
                            claro = IDV > median(IDV, na.rm = TRUE) * 1.2)
  ggplot(dados, aes({{ x }}, {{ y }}, fill = IDV)) +
    geom_tile() +
    geom_text(aes(label = txt, fontface = if_else(pouca, "italic", "plain"), color = claro), size = tam, show.legend = FALSE) +
    scale_color_manual(values = c("TRUE" = "white", "FALSE" = "#222222")) +
    scale_fill_gradient(low = "#FFF7E0", high = "#B7410E") +
    labs(title = titulo, x = xlab, y = ylab, caption = nota) + tema + theme(panel.grid = element_blank())
}
rot_faixa <- function(x) sub("acima de ", ">", x)
nota_cel  <- "* itálico = célula com menos de 100 armadilhas examinadas: leia com cautela"

# g10 · mapa de calor DS × faixa de distância
t13 <- indicadores(ok, ds, faixa_dist)                          # DS II 600–1.000 m (A = 45) e DS VIII > 1.000 m (A = 12) são pequenas
g10 <- mapa_calor(t13, faixa_dist, fct_rev(ds), 100, "IDV por distrito sanitário e distância até a EDL mais próxima",
                  "distância até a EDL mais próxima", "distrito sanitário", nota_cel) +
  scale_x_discrete(labels = rot_faixa, drop = FALSE)
ggsave("graficos_r/g10_heatmap_ds_x_faixa.png", g10, width = 8.6, height = 4.2, dpi = 150)

# g11 · mapa de calor ciclo × faixa de distância
t14 <- indicadores(ok, ciclo, faixa_dist)
g11 <- mapa_calor(t14, faixa_dist, fct_rev(factor(ciclo)), 100, "IDV por ciclo e distância até a EDL mais próxima",
                  "distância até a EDL mais próxima", "ciclo", nota_cel) +
  scale_x_discrete(labels = rot_faixa, drop = FALSE)
ggsave("graficos_r/g11_heatmap_ciclo_x_faixa.png", g11, width = 8.6, height = 5.4, dpi = 150)

# g12 · mapa de calor bairro × ciclo (bairros com >= 300 armadilhas no ano; do maior para o menor IDV)
t15 <- indicadores(fato, bairro, ciclo) %>%
  group_by(bairro) %>% filter(sum(A) >= 300) %>% mutate(idv_ano = sum(O) / sum(A)) %>% ungroup() %>%
  mutate(bairro = str_to_title(bairro))
t15$bairro <- fct_reorder(t15$bairro, t15$idv_ano)               # maior IDV do ano no topo (o eixo y cresce de baixo para cima)
g12 <- mapa_calor(t15, factor(ciclo, levels = 1:12), bairro, 30,
                  paste0("IDV por bairro e ciclo (", n_distinct(t15$bairro), " bairros com ≥ 300 armadilhas no ano)"),
                  "ciclo", "bairro (do maior para o menor IDV no ano)",
                  "exploratório: cada célula tem poucas armadilhas (mediana ≈ 50) · * = menos de 30 armadilhas", tam = 2.3)
ggsave("graficos_r/g12_heatmap_bairro_x_ciclo.png", g12, width = 9, height = 8.6, dpi = 150)

message("Gráficos salvos em graficos_r/")
