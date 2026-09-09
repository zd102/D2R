$ErrorActionPreference = 'Stop'
$sourceCommit = 'e67aa992be5db412bd0437bb8afb95eedee0c9bc'
$localeCommit = 'fc469993502d0498809b9fc1af140ee2a9eb8902'
$sourceRoot = "https://raw.githubusercontent.com/fabd/diablo2/$sourceCommit/code/d2_113_data/"
Add-Type -AssemblyName System.Web.Extensions
Add-Type -AssemblyName Microsoft.VisualBasic
$json = New-Object System.Web.Script.Serialization.JavaScriptSerializer
$json.MaxJsonLength = 20000000
$localeRaw = (Invoke-WebRequest -UseBasicParsing "https://raw.githubusercontent.com/blizzhackers/d2data/$localeCommit/json/localestrings-chi.json").Content
if ($localeRaw -is [byte[]]) { $localeRaw = [Text.Encoding]::UTF8.GetString($localeRaw) }
$locale = $json.DeserializeObject($localeRaw)
function Localize([string]$key, [string]$fallback) {
    if ($locale.ContainsKey($key)) { return [Microsoft.VisualBasic.Strings]::StrConv($locale[$key], [Microsoft.VisualBasic.VbStrConv]::SimplifiedChinese, 2052) }
    return $fallback
}
function Read-Table([string]$name) {
    $raw = (Invoke-WebRequest -UseBasicParsing ($sourceRoot + $name + '.txt')).Content
    if ($raw -is [byte[]]) { $raw = [Text.Encoding]::UTF8.GetString($raw) }
    $lineEnd = $raw.IndexOf("`n"); $seen = @{}
    $headers = @($raw.Substring(0, $lineEnd).TrimEnd("`r").Split("`t") | ForEach-Object {
        $key = $_; if (!$key) { $key = 'unused' }
        if ($seen.ContainsKey($key)) { $seen[$key]++; $key + '__' + $seen[$key] } else { $seen[$key] = 0; $key }
    })
    return @($raw.Substring($lineEnd + 1) | ConvertFrom-Csv -Delimiter "`t" -Header $headers)
}
function Properties($row, $indices, $code = 'prop', $param = 'par', $min = 'min', $max = 'max') {
    $result = @()
    foreach ($i in $indices) { if ($row."$code$i") { $result += ,@([string]$row."$code$i", [string]$row."$param$i", [int]$row."$min$i", [int]$row."$max$i") } }
    return ,$result
}
$bases = @()
foreach ($table in @('Weapons', 'Armor', 'Misc')) {
    foreach ($r in (Read-Table $table)) {
        if (!$r.code -or !$r.type -or $r.type -eq 'tpot' -or ($table -ne 'Misc' -and ($r.spawnable -ne '1' -or [int]$r.quest -gt 0)) -or ($table -eq 'Misc' -and $r.code -notin @('rin','amu','jew','cm1','cm2','cm3'))) { continue }
        $twoHanded = $r.'2handed' -eq '1'
        $bases += [ordered]@{
            code = $r.code; name = (Localize $r.namestr $r.name); type = $r.type; weapon = ($table -eq 'Weapons')
            level = [int]$r.level; requiredLevel = [int]$r.levelreq; magicLevel = [int]$r.'magic lvl'; strength = [int]$r.reqstr; dexterity = [int]$r.reqdex
            min = $(if ($twoHanded) { [int]$r.'2handmindam' } else { [int]$r.mindam }); max = $(if ($twoHanded) { [int]$r.'2handmaxdam' } else { [int]$r.maxdam })
            defense = [int][math]::Floor(([int]$r.minac + [int]$r.maxac) / 2); defenseMin = [int]$r.minac; defenseMax = [int]$r.maxac; block = [int]$r.block
            speed = [int]$r.speed; twoHanded = $twoHanded; sockets = [int]$r.gemsockets; durability = [int]$r.durability
            width = [int]$r.invwidth; height = [int]$r.invheight; rarity = [int]$r.rarity
        }
    }
}
$specials = @(); $excluded = @()
foreach ($table in @('UniqueItems','SetItems')) {
    $index = -1
    foreach ($r in (Read-Table $table)) {
        $index++
        $code = if ($table -eq 'UniqueItems') { $r.code } else { $r.item }
        if (!$code -or ($table -eq 'UniqueItems' -and $r.enabled -ne '1')) { continue }
        if ($code -notin $bases.code) { $excluded += $r.index; continue }
        $partial = @()
        foreach ($n in 1..5) { $partial += ,@(($n + 1), (Properties $r @("${n}a","${n}b") 'aprop' 'apar' 'amin' 'amax')) }
        $specials += [ordered]@{
            id = $(if ($table -eq 'UniqueItems') { "unique-$index" } else { "set-$index" })
            key = $r.index; name = (Localize $r.index $r.index); code = $code
            rarity = $(if ($table -eq 'UniqueItems') { 'unique' } else { 'set' }); weight = [int]$r.rarity
            qualityLevel = [int]$r.lvl; requiredLevel = [int]$r.'lvl req'; set = [string]$r.set
            properties = (Properties $r (1..12)); partial = $partial
            addFunction = [int]$r.'add func'
        }
    }
}
$words = @()
foreach ($r in (Read-Table 'Runes')) {
    if ($r.complete -ne '1') { continue }
    $words += [ordered]@{
        id = $r.Name; key = $r.'Rune Name'; name = (Localize $r.Name $r.'Rune Name')
        runes = @(1..6 | ForEach-Object { $r."Rune$_" } | Where-Object { $_ })
        include = @(1..6 | ForEach-Object { $r."itype$_" } | Where-Object { $_ }); exclude = @(1..3 | ForEach-Object { $r."etype$_" } | Where-Object { $_ })
        properties = (Properties $r (1..7) 'T1Code' 'T1Param' 'T1Min' 'T1Max')
    }
}
$sets = @()
foreach ($r in (Read-Table 'Sets')) {
    if (!$r.index -or $r.index -notin @($specials | ForEach-Object { $_['set'] })) { continue }
    $partial = @()
    foreach ($n in 2..5) { $partial += ,@($n, (Properties $r @("${n}a","${n}b") 'PCode' 'PParam' 'PMin' 'PMax')) }
    $sets += [ordered]@{ id = $r.index; name = (Localize $r.name $r.name); partial = $partial; full = (Properties $r (1..8) 'FCode' 'FParam' 'FMin' 'FMax') }
}
$treasures = @()
foreach ($r in (Read-Table 'TreasureClassEx')) {
    if ($r.'Treasure Class' -notmatch '^(Runes \d+|Countess.*)$') { continue }
    $entries = @(); foreach ($n in 1..10) { if ($r."Item$n") { $entries += ,@($r."Item$n", [int]$r."Prob$n") } }
    $treasures += [ordered]@{ id = $r.'Treasure Class'; picks = [int]$r.Picks; noDrop = [int]$r.NoDrop; entries = $entries }
}
$out = @(
    '// Generated by scripts/import-items.ps1; original LoD 1.13 gameplay data, localized names only from D2R.'
    "export const ITEM_SOURCE_COMMIT = '$sourceCommit';"
    "export const ITEM_LOCALE_COMMIT = '$localeCommit';"
    'export type CatalogProperty = [code: string, param: string, min: number, max: number];'
    'export type CatalogBase = { code: string; name: string; type: string; weapon: boolean; level: number; requiredLevel: number; magicLevel: number; strength: number; dexterity: number; min: number; max: number; defense: number; defenseMin: number; defenseMax: number; block: number; speed: number; twoHanded: boolean; sockets: number; durability: number; width: number; height: number; rarity: number };'
    "export type CatalogSpecial = { id: string; key: string; name: string; code: string; rarity: 'unique' | 'set'; weight: number; qualityLevel: number; requiredLevel: number; set: string; properties: CatalogProperty[]; partial: [number, CatalogProperty[]][]; addFunction: number };"
    'export type CatalogWord = { id: string; key: string; name: string; runes: string[]; include: string[]; exclude: string[]; properties: CatalogProperty[] };'
    'export type CatalogSet = { id: string; name: string; partial: [number, CatalogProperty[]][]; full: CatalogProperty[] };'
    'export type CatalogTreasure = { id: string; picks: number; noDrop: number; entries: [string, number][] };'
)
foreach ($entry in @(@('CATALOG_BASES','CatalogBase',$bases), @('CATALOG_SPECIALS','CatalogSpecial',$specials), @('CATALOG_RUNEWORDS','CatalogWord',$words), @('CATALOG_SETS','CatalogSet',$sets), @('RUNE_TREASURES','CatalogTreasure',$treasures))) {
    $out += "export const $($entry[0]): $($entry[1])[] = ["
    $out += $entry[2] | ForEach-Object { '  ' + ($_ | ConvertTo-Json -Depth 12 -Compress) + ',' }
    $out += '];'
}
$out += 'export const EXCLUDED_QUEST_ITEMS: string[] = ' + (ConvertTo-Json -InputObject @($excluded) -Compress) + ';'
[IO.File]::WriteAllText((Join-Path $PSScriptRoot '../src/item-catalog-data.ts'), ($out -join "`n") + "`n", [Text.UTF8Encoding]::new($false))
Write-Output "Imported $($bases.Count) bases, $($specials.Count) specials, $($words.Count) runewords, $($sets.Count) sets. Excluded quest items: $($excluded -join ', ')."
