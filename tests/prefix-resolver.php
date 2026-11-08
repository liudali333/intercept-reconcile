<?php
require __DIR__ . '/../backend/lib/CarrierResolver.php';
function expect($want,$got) { if($want!==$got) throw new RuntimeException('unexpected result'); }
expect(['SF','78','001'],CarrierResolver::parse("sf, 78，001\nsf"));
$rules=[['prefix'=>'7','courier_id'=>1,'status'=>1],['prefix'=>'78','courier_id'=>2,'status'=>1],['prefix'=>'001','courier_id'=>3,'status'=>1]];
expect(2,CarrierResolver::match('781234567',$rules));
expect(1,CarrierResolver::match('791234567',$rules));
expect(3,CarrierResolver::match('001123456',$rules));
$rules[1]['status']=0;
foreach([fn()=>CarrierResolver::match('781234567',$rules),fn()=>CarrierResolver::match('991234567',$rules),fn()=>CarrierResolver::parse('SF%')] as $test) {
    $failed=false;try{$test();}catch(RuntimeException $e){$failed=true;}
    if(!$failed) throw new RuntimeException('invalid rule accepted');
}
echo "PASS: prefix parsing, longest match, leading zero, disabled and unmatched rejection\n";
